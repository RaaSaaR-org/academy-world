/**
 * The stills tour's boot (WP-D0, founder decision 3): weak phones get the same stops and cards with
 * pre-rendered images instead of the 3D world. main.ts imports this chunk INSTEAD of the game when the
 * gate says gate.stills: no Game, no three, no Rapier, no world chunk, no GLB; ≤ 400 KB before the first
 * image (tools/discover/load.mjs). D1 fills it in through src/discover/tour/stills.ts (its 12 stops and
 * cards, the tour UI); until then a placeholder tour of the spike's three stops runs.
 */
import '../discover.css';
import type { Lang } from '@/core/types';
import type { DiscoverParams, ShareWhat, StillSource, StillsHandle, StillsInstall, StillsReason, StillsStage, TourEnterArg, TourStop } from '../types';
import type { Text } from '@/core/types';
import { PlainText, startLang } from '../ui/text';
import { createShell, settingsItems, wireKeys } from '../ui/shell';
import { startCard, type StartCard } from '../ui/start';
import { showLaptopCard } from '../ui/laptop';
import { el, publicUrl } from '../ui/el';
import { MemorySettings } from '../settings';
import { Modes } from '../modes';
import { S } from '../strings';
import { clearAlive, setSessionMode, switchTo3d } from '../detect';
import { SPIKE_STOPS, SPIKE_TEXT } from '../spike-data';
import { placeholderSvg, stillSrcset } from './paths';

/** src/discover/<pkg>/stills.ts (D1: the tour, D3: share) */
const INSTALLS = import.meta.glob<{ default: StillsInstall }>('../*/stills.ts', { eager: true });

/** Two layers that cross-fade; a missing image shows the placeholder (with the stop's name). */
class Stage implements StillsStage {
  readonly el: HTMLElement;
  private cur: Element | null = null;
  current: string | null = null;
  lastLoaded = false;

  constructor(
    parent: HTMLElement,
    private t: PlainText,
  ) {
    this.el = el('div', { class: 'dsc-stage', 'aria-hidden': 'false' });
    parent.prepend(this.el);
  }

  show(src: StillSource, alt: Text): Promise<void> {
    this.current = src.stop;
    const label = this.t.resolve(alt);
    return new Promise((resolve) => {
      const img = el('img', { class: 'off', alt: label, sizes: '100vw', decoding: 'async', srcset: stillSrcset(src.stop), 'data-stop': src.stop });
      const swap = (next: Element, loaded: boolean): void => {
        if (this.current !== src.stop) return resolve();
        this.lastLoaded = loaded;
        next.classList.add('off');
        this.el.append(next);
        const prev = this.cur;
        this.cur = next;
        requestAnimationFrame(() => {
          next.classList.remove('off');
          prev?.classList.add('off');
          window.setTimeout(() => prev?.remove(), 650);
          resolve();
        });
      };
      img.addEventListener('load', () => swap(img, true), { once: true });
      img.addEventListener('error', () => swap(placeholderSvg(label), false), { once: true });
    });
  }
}

export async function bootStills(app: HTMLElement, reason: StillsReason): Promise<void> {
  const t = new PlainText(startLang());
  document.documentElement.lang = t.lang;
  document.documentElement.classList.add('dsc-on');
  // remembered for this session (the gate reads it next time); the 3D session's marker is spent
  if (reason !== 'forced' && reason !== 'webgl2') setSessionMode('stills');
  clearAlive();
  const q = new URLSearchParams(location.search);
  const params: DiscoverParams = { perf: q.get('perf') === '1', bench: q.get('bench') === '1', stop: q.get('stop'), robot: q.get('robot'), lang: q.get('lang') === 'en' ? 'en' : q.get('lang') === 'de' ? 'de' : null };
  const settings = new MemorySettings();
  const stage = new Stage(app, t);
  const shell = createShell(app, null, t, { setLang: (l: Lang) => t.setLang(l), settings, extraClass: 'dsc-stills' });
  const modes = new Modes();
  const h: StillsHandle = {
    reason,
    params,
    text: t,
    sheet: shell.sheet,
    topbar: shell.topbar,
    menu: shell.menu,
    ui: shell.ui,
    stage,
    gestures: { onNav: (fn) => shell.nav.on(fn) },
    modes,
    settings,
    setLang: (l) => t.setLang(l),
    try3d: reason === 'webgl2' ? null : switchTo3d,
  };
  wireKeys(shell);
  for (const it of settingsItems(settings)) h.menu.add(it);
  if (h.try3d) h.menu.add({ id: 'try3d', order: 25, label: S.try3d, onSelect: () => h.try3d?.() });
  h.menu.add({ id: 'laptop', order: 30, label: S.playOnLaptop, onSelect: () => void (h.share ? h.share({ kind: 'game' } satisfies ShareWhat) : showLaptopCard(h.sheet, h.ui)) });
  h.menu.add({ id: 'credits', order: 80, label: S.credits, onSelect: () => void window.open(publicUrl('THIRD-PARTY-NOTICES.txt'), '_blank', 'noopener') });

  for (const [path, mod] of Object.entries(INSTALLS).sort(([a], [b]) => a.localeCompare(b))) {
    try {
      await mod.default(h);
    } catch (err) {
      console.error(`[discover] ${path} failed to install`, err);
    }
  }
  const placeholder = placeholderTour(h);
  if (!modes.has('tour')) modes.register('tour', placeholder);
  const stops = (): readonly TourStop[] => h.stops?.() ?? SPIKE_STOPS;

  // the loading shell gives way
  const shellEl = document.getElementById('loading');
  shellEl?.classList.add('done');
  window.setTimeout(() => shellEl?.classList.add('hidden'), 650);

  let card: StartCard | null = null;
  let started = false;
  const go = async (stop?: string): Promise<void> => {
    card?.hide();
    started = true;
    await modes.enter('tour', stop ? ({ stop } satisfies TourEnterArg) : {});
  };
  (window as unknown as { __discover?: unknown }).__discover = {
    path: 'stills' as const,
    handle: h,
    state: () => ({ path: 'stills', reason, started, startCard: !!card?.shown, mode: modes.current, stop: stage.current, image: stage.lastLoaded, snap: h.sheet.snap, card: h.sheet.card?.id ?? null, lang: t.lang, stills: reason }),
    stops: () => stops().map((s) => ({ id: s.id, title: t.resolve(s.title), areas: [...s.areas] })),
    goto: (id: string) => go(id),
    start: () => go(),
  };
  if (params.stop) {
    await go(params.stop);
    return;
  }
  // the first still behind the start card
  void stage.show({ stop: stops()[0]?.id ?? 'dock' }, stops()[0]?.title ?? S.stillsTour);
  h.topbar.setStep(0, 0, S.stillsTour);
  card = startCard(shell.root, t, { eyebrow: SPIKE_TEXT.dock.eyebrow, title: S.discover, body: SPIKE_TEXT.dock.body, note: S.laptopNote, onGo: () => void go() });
}

/** D0's placeholder: the spike's three stops, their stills (placeholders until D1 renders them) and cards. */
function placeholderTour(h: StillsHandle): { enter(arg?: unknown): Promise<void>; exit(): void } {
  const stops = SPIKE_STOPS;
  let at = 0;
  let off: (() => void) | null = null;
  const show = async (k: number): Promise<void> => {
    at = Math.max(0, Math.min(stops.length - 1, k));
    const s = stops[at];
    h.topbar.setStep(at + 1, stops.length, s.title);
    h.sheet.setNav({ prev: at > 0, next: at < stops.length - 1 });
    const text = SPIKE_TEXT[s.id as keyof typeof SPIKE_TEXT] as { eyebrow?: Text; title?: Text; body?: Text };
    h.sheet.show({ id: `stills:${s.id}`, eyebrow: text.eyebrow, title: text.title ?? s.title, blocks: text.body ? [{ kind: 'p', text: text.body }] : [] }, 'peek');
    h.ui.announce(s.title);
    await h.stage.show({ stop: s.id }, s.title);
  };
  return {
    async enter(arg?: unknown) {
      const a = (arg ?? {}) as TourEnterArg;
      off ??= h.gestures.onNav((d) => void show(at + d));
      const k = a.stop ? stops.findIndex((s) => s.id === a.stop) : at;
      await show(k < 0 ? 0 : k);
    },
    exit() {
      off?.();
      off = null;
    },
  };
}
