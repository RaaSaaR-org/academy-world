/**
 * The film (WP-D3, plan §5 WP-D3 „Film flow“): the lift-off replayed on the live engine — the same
 * director, sound, captions and EMI-01's lines as the desktop's „Abheben ansehen“, no video. Its own lazy
 * chunk (≤ 10 KB with its CSS).
 *
 *   enter   fade · the camera detached (the engine's player camera and the director draw; the observer
 *           stops with the feet where they are) · #hud.film without .no-hud (captions, EMI-01, the banner,
 *           the lift-off card, the outside shot's chip) · EMI-01's voice on ·
 *           'liftoff:replay' { from: 'discover', stills }
 *   film    „Überspringen“ sends 'liftoff:skip' (the director's fade to its final state)
 *   end     'flight:phase' { name: 'dusk' } at the level-off: the end card („Am Laptop spielen“,
 *           „Nochmal ansehen“, „Zurück zur Tour“); enter() resolves here (the bench waits for it)
 *   exit    the island back in its dock (quest.setFlight('ground')), the camera attached, the observer
 *           following, the voice off
 *
 * The stills version (the director's own, ≈ 45 s of held views and cross-fades) plays when the caller
 * asks for it, under reduced motion, or with the tier's 'auto' when the last 3 s ran at p90 > 50 ms.
 */
import './film.css';
import type { CardSpec, DiscoverHandle, FilmEnterArg } from '../types';
import { S } from '../strings';
import { el } from '../ui/el';
import { share } from './share';
import { F } from './strings';

/** the finale's chunk is loaded in idle time after game:ready; on a slow line the film waits this long for it */
const START_TIMEOUT_MS = 60000;
/** after the level-off, EMI-01's line may run on this long before the end card comes */
const LAST_LINE_MS = 6000;
/** the #hud pieces the film shows besides #caption and #dialogue (discover.css: [data-film]) */
const FILM_HUD = ['zone-banner', 'panels', 'lo-shot'];

interface Run {
  stills: boolean;
  /** 'spinup' seen: the next 'dusk' with h > 0 is this run's level-off (docking emits one at h 0) */
  started: boolean;
  /** the level-off ('dusk'): the director is done */
  arrived: boolean;
  skipped: boolean;
  /** the end card is up (or the run was abandoned): enter() has resolved */
  ended: boolean;
  done: Promise<void>;
  resolve(): void;
  offs: (() => void)[];
}

let run: Run | null = null;
/** the camera is detached and the HUD is in its film state */
let active = false;
/** the „lädt …“ chip is ours until the director starts */
let busy = false;
let skipBtn: HTMLButtonElement | null = null;
let guarded = false;
/** Discover keeps the HUD in its title state (Hud.setPlaying(false): #hud.no-hud, every piece at opacity 0) */
let noHud = false;

/** The tier's film rule (types.ts DiscoverTier.film) unless the caller decided. */
export function wantStills(h: DiscoverHandle, arg: FilmEnterArg): boolean {
  if (arg.stills != null) return arg.stills;
  if (h.tier.film !== 'auto') return h.tier.film === 'stills';
  return h.settings.reducedMotion || h.perf.window(3000).p90 > 50;
}

export async function enter(h: DiscoverHandle, arg: FilmEnterArg): Promise<void> {
  if (run && !run.ended) return run.done;
  const ev = h.game.events;
  const stills = wantStills(h, arg);
  let resolve!: () => void;
  const done = new Promise<void>((res) => (resolve = res));
  const r: Run = { stills, started: false, arrived: false, skipped: false, ended: false, done, resolve, offs: [] };
  run = r;
  guardDusk(h);
  h.sheet.hide();
  h.topbar.setStep(0, 0, F.film);
  setBusy(h, true);
  await h.ui.fade(true, 0.4);
  // left during the fade (exit() finished the run)
  if (run !== r) return done;
  if (!active) {
    active = true;
    h.gestures.enabled = false;
    // the feet stay where they are while the engine's camera draws (the replay puts the player at the console)
    h.observer.pin(h.observer.feet);
    h.camera.detach();
    // the film's pieces fade with their own .show again; discover.css keeps every other piece hidden
    const root = h.game.hud.root;
    noHud = root.classList.contains('no-hud');
    root.classList.remove('no-hud');
    root.classList.add('film');
    h.voice(true);
  }
  const timer = window.setTimeout(() => {
    if (run !== r || r.started) return;
    // the finale never came (its chunk failed to load): back to the tour
    finish(r);
    void h.modes.enter('tour', {});
  }, START_TIMEOUT_MS);
  r.offs.push(() => window.clearTimeout(timer));
  r.offs.push(
    ev.on('flight:phase', (p?: { name?: string; h?: number }) => {
      if (run !== r) return;
      if (p?.name === 'spinup' && !r.started) {
        r.started = true;
        setBusy(h, false);
        filmHud(true);
        showSkip(h, r);
        h.ui.announce(F.film);
        void h.ui.fade(false, 0.4);
      } else if (p?.name === 'dusk' && r.started && !r.arrived && (p.h ?? 0) > 0) {
        r.arrived = true;
        showSkip(h, null);
        // EMI-01's last line („Willkommen über den Wolken …“) finishes before the card covers the subtitles
        void until(() => run !== r || r.skipped || !h.game.hud.dialogue.busy, LAST_LINE_MS).then(() => {
          if (run !== r || r.ended) return;
          finish(r);
          endCard(h, r.stills);
        });
      }
    }),
  );
  ev.emit('liftoff:replay', { from: 'discover', stills });
  return done;
}

function finish(r: Run): void {
  r.ended = true;
  for (const off of r.offs.splice(0)) off();
  r.resolve();
}

function setBusy(h: DiscoverHandle, on: boolean): void {
  if (busy === on) return;
  busy = on;
  h.ui.busy(on);
}

export async function exit(h: DiscoverHandle): Promise<void> {
  const r = run;
  showSkip(h, null);
  setBusy(h, false);
  if (r && !r.ended) {
    if (r.started && !r.arrived) {
      // leaving mid-film (the bench, a test): skip to the level-off first
      r.skipped = true;
      h.game.events.emit('liftoff:skip');
      await until(() => r.arrived, 6000);
    }
    finish(r);
  }
  run = null;
  if (active) {
    active = false;
    // the lift-off releases its lock just after 'dusk': dock on the next tick
    await wait(0);
    h.ctx.quest.setFlight('ground');
    filmHud(false);
    h.game.hud.root.classList.remove('film');
    if (noHud) h.game.hud.root.classList.add('no-hud');
    h.voice(false);
    h.camera.attach();
    h.observer.follow();
    h.gestures.enabled = true;
  }
  h.sheet.hide();
  void h.ui.fade(false, 0.4);
}

function endCard(h: DiscoverHandle, stills: boolean): void {
  const card: CardSpec = {
    id: 'film:end',
    eyebrow: { key: 'core.start.kicker' },
    title: { key: 'core.brand.tagline' },
    blocks: [{ kind: 'p', text: S.laptopNote }],
    actions: [
      { id: 'laptop', primary: true, label: S.playOnLaptop, onSelect: () => void share(h, { kind: 'game' }, { back: { id: 'back', label: S.prev, onSelect: () => endCard(h, stills) } }) },
      { id: 'again', label: F.again, onSelect: () => void h.modes.enter('film', { stills } satisfies FilmEnterArg) },
      {
        id: 'tour',
        label: F.backToTour,
        onSelect: () =>
          void h.ui.fade(true, 0.4).then(() => {
            const first = h.stops?.()[0]?.id ?? 'dock';
            return h.modes.enter('tour', { stop: first });
          }),
      },
    ],
  };
  h.sheet.setNav(null);
  h.sheet.show(card, 'half');
  h.ui.announce(card.title);
}

/** „Überspringen“ (r: shown for this run; null: hidden): top right under the bar (the subtitles and the sheet own the bottom). */
function showSkip(h: DiscoverHandle, r: Run | null): void {
  if (r && !skipBtn) {
    skipBtn = el('button', { type: 'button', class: 'dsc-btn dsc-film-skip', 'data-action': 'skip' });
    const label = (): void => void (skipBtn && (skipBtn.textContent = h.text.resolve(F.skip)));
    label();
    h.text.onChange(label);
    h.ui.root.append(skipBtn);
  }
  if (!skipBtn) return;
  skipBtn.hidden = !r;
  skipBtn.onclick = r
    ? () => {
        r.skipped = true;
        h.game.events.emit('liftoff:skip');
      }
    : null;
}

function filmHud(on: boolean): void {
  for (const id of FILM_HUD) {
    const e = document.getElementById(id);
    if (on) e?.setAttribute('data-film', '');
    else e?.removeAttribute('data-film');
  }
}

/**
 * Dusk exists only airborne (§5.7). A replay's ending blends the dusk in over 20 s (finale/ending.ts);
 * docked again before that, its last steps must not paint the evening onto the docked island.
 */
function guardDusk(h: DiscoverHandle): void {
  if (guarded) return;
  guarded = true;
  const ev = h.game.events;
  let inner = false;
  ev.on('finale:dusk', (p?: { t?: number }) => {
    if (inner || !p || !(Number(p.t) > 0) || h.ctx.flight.state !== 'ground') return;
    inner = true;
    ev.emit('finale:dusk', { t: 0 });
    inner = false;
  });
}

const wait = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

/** resolves once ok() holds (checked every 100 ms) or after ms */
async function until(ok: () => boolean, ms: number): Promise<void> {
  const t0 = performance.now();
  while (!ok() && performance.now() - t0 < ms) await wait(100);
}
