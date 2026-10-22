/**
 * The stills tour (WP-D1, founder decision 3): weak phones get the same 12 stops and the same cards with
 * pre-rendered pictures (public/discover/stills/<stop>-720.webp / -1280.webp, rendered from the stop poses
 * by tools/discover/stills.mjs) instead of the 3D world. Game-free: src/discover/stills/boot.ts picks this
 * file up; it imports only plain data and Discover's own UI (no three, no game, no world, no GLB).
 * Prev / next: ←/→, the sheet's ‹ ›, a sideways swipe on the collapsed sheet, and a sideways swipe on
 * the picture. „Hier zu sehen“ lists the stop's spots (their cards, text only).
 */
import type { CardAction, CardSpec, SheetSnap, StillsHandle, TourEnterArg } from '../types';
import { showLaptopCard } from '../ui/laptop';
import { S } from '../strings';
import { STOPS, stopIndex, type StopData } from './stops';
import { SPOTS, type SpotData } from './spots';
import { contentCard, showStopList, spotLabel, withBack, type ChipItem } from './cards';
import { T } from './strings';

export default function install(h: StillsHandle): void {
  const n = STOPS.length;
  let at = 0;
  let offNav: (() => void) | null = null;

  const actions = (s: StopData): CardAction[] =>
    s.id === 'abheben' ? [{ id: 'laptop', primary: true, label: S.playOnLaptop, onSelect: () => void (h.share ? h.share({ kind: 'game' }) : showLaptopCard(h.sheet, h.ui)) }] : [];
  const chips = (s: StopData): ChipItem[] =>
    SPOTS.filter((p) => s.spots.includes(p.id)).map((p) => ({ label: spotLabel(p.card), onSelect: () => showSpot(p) }));
  const card = (s: StopData): CardSpec => contentCard(s.card, { chips: chips(s), actions: actions(s) }) ?? { id: s.card, title: s.title, blocks: [] };
  const showCard = (snap: SheetSnap): void => h.sheet.show(card(STOPS[at]), snap);
  function showSpot(p: SpotData): void {
    const c = contentCard(p.card);
    if (!c) return;
    h.sheet.show(withBack({ ...c, id: p.card }, () => showCard('half')), 'half');
    h.ui.announce(c.title);
  }

  const show = async (k: number): Promise<void> => {
    at = Math.max(0, Math.min(n - 1, k));
    const s = STOPS[at];
    h.topbar.setStep(at + 1, n, s.title);
    h.sheet.setNav({ prev: at > 0, next: at < n - 1 });
    showCard('peek');
    h.ui.announce(s.title);
    await h.stage.show({ stop: s.id }, s.title);
  };

  // a sideways swipe on the picture (the sheet has its own)
  const stage = h.stage.el;
  stage.classList.add('dsc-swipe');
  let sx = 0,
    sy = 0,
    st = 0,
    sid = -1;
  stage.addEventListener('pointerdown', (e) => {
    sid = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    st = performance.now();
  });
  stage.addEventListener('pointerup', (e) => {
    if (e.pointerId !== sid || h.modes.current !== 'tour') return;
    sid = -1;
    const dx = e.clientX - sx,
      dy = e.clientY - sy;
    if (Math.abs(dx) > 48 && Math.abs(dx) > 1.5 * Math.abs(dy) && performance.now() - st < 900) {
      const dir = dx < 0 ? 1 : -1;
      if (STOPS[at + dir]) void show(at + dir);
    }
  });
  stage.addEventListener('pointercancel', () => (sid = -1));

  h.stops = () => STOPS;
  h.modes.register('tour', {
    async enter(arg?: unknown) {
      const a = (arg ?? {}) as TourEnterArg;
      offNav ??= h.gestures.onNav((d) => {
        if (STOPS[at + d]) void show(at + d);
      });
      const k = a.stop ? stopIndex(a.stop) : at;
      await show(k < 0 ? 0 : k);
    },
    exit() {
      offNav?.();
      offNav = null;
    },
  });
  h.menu.add({
    id: 'stops',
    order: 5,
    label: T.allStops,
    onSelect: () => {
      const open = (): void => showStopList(h.sheet, h.text, at, (id) => void h.modes.enter('tour', { stop: id } satisfies TourEnterArg));
      if (h.modes.current === 'tour') open();
      else void h.modes.enter('tour', {}).then(open);
    },
  });
}
