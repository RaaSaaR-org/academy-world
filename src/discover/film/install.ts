/**
 * WP-D3 in the 3D path: the mode 'film' (the lift-off on the live engine, ./film.ts behind a dynamic
 * import: its own small chunk) and handle.share (./share.ts, Game-free, shared with the stills path).
 */
import type { DiscoverHandle, FilmEnterArg } from '../types';
import { share } from './share';

export default function install(h: DiscoverHandle): void {
  h.share = (what) => share(h, what).then(() => undefined);
  let mod: Promise<typeof import('./film')> | null = null;
  const film = (): Promise<typeof import('./film')> => (mod ??= import('./film'));
  h.modes.register('film', {
    enter: (arg) => film().then((m) => m.enter(h, (arg ?? {}) as FilmEnterArg)),
    exit: () => film().then((m) => m.exit(h)),
  });
}
