/**
 * WP-D1's entry on the 3D path (src/discover/index.ts calls it before the start card): the 12 stops
 * (handle.stops), goto (discover:goto, ?stop=, the bench) and the 'tour' mode. The tour itself (flights,
 * cards, markers, picking) is a lazy chunk, fetched while the start card shows. Plus „Alle Stopps“ in
 * the menu (the stop list, plan §4).
 */
import type { DiscoverHandle } from '../types';
import { STOPS } from './stops';
import { T } from './strings';
import type { Tour, TourArg } from './tour';

export default function install(h: DiscoverHandle): void {
  let tour: Promise<Tour> | null = null;
  const load = (): Promise<Tour> => (tour ??= import('./tour').then((m) => m.createTour(h)));

  h.stops = () => STOPS;
  h.goto = async (id, o = {}) => {
    if (h.modes.current !== 'tour') return h.modes.enter('tour', { stop: id, instant: o.instant } satisfies TourArg);
    return (await load()).goto(id, o);
  };
  h.modes.register('tour', {
    async enter(arg?: unknown) {
      return (await load()).enter((arg ?? {}) as TourArg);
    },
    async exit() {
      if (tour) (await tour).exit();
    },
  });
  h.menu.add({
    id: 'stops',
    order: 5,
    label: T.allStops,
    onSelect: () => void load().then((t) => (h.modes.current === 'tour' ? t.showList() : h.modes.enter('tour', {}).then(() => t.showList()))),
  });
  // tools: the tour's own state (markers on screen, the chips' ids)
  (window as unknown as { __discoverTour?: () => Promise<ReturnType<Tour['state']>> }).__discoverTour = () => load().then((t) => t.state());
  // fetch the tour while the start card shows (no compile, no download on the critical path)
  window.setTimeout(() => void load(), 1200);
}
