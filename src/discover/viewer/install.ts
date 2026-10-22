/**
 * WP-D2 (plan §3.4, §5): the Schauhalle viewer and the robot cards, plugged into the 3D path.
 *   - h.robots: card(id) (a hall robot's card with „In 3D ansehen“; D1's hotspots), open(id), ids();
 *   - the mode 'viewer' (enter({ robot? })): the studio, a lazy chunk (./studio.ts) loaded on first use.
 * The robot data (./data.ts with src/discover/data/robots.gen.ts) is a small chunk of its own, fetched
 * while the game boots, so card() answers synchronously from the start card on. Amber exhibits exist
 * only under SHOW_AMBER (./data.ts); robots of other places that are a hall robot under another model id
 * (the SO-101 leader arm, the G1 with Dex3 hands) get that robot's card.
 */
import type { DiscoverHandle, RobotId, ViewerEnterArg } from '../types';
import type { Viewer } from './studio';
import { robotCard } from './cards';
import { V } from './strings';

// started when the Discover chunk runs (Game.boot, next to Rapier and the world), awaited in install()
const dataP = import('./data');
dataP.catch(() => undefined);

const ALIAS: Partial<Record<RobotId, RobotId>> = { 'so101-leader': 'so101', 'unitree-g1-dex3': 'unitree-g1' };

export default async function install(h: DiscoverHandle): Promise<void> {
  let data: Awaited<typeof dataP>;
  try {
    data = await dataP;
  } catch (err) {
    console.error('[discover] viewer: the robot data did not load', err);
    return;
  }
  const byId = new Map(data.HALL.map((r) => [r.id, r]));
  const find = (id: RobotId) => byId.get(id) ?? (ALIAS[id] ? byId.get(ALIAS[id]!) : undefined);
  const open = (id: RobotId): void => void h.modes.enter('viewer', { robot: id } satisfies ViewerEnterArg);

  h.robots = {
    card(id) {
      const r = find(id);
      return r ? robotCard(r, data.TEXT, [{ id: 'view3d', primary: true, label: V.view3d, onSelect: () => open(r.id) }]) : null;
    },
    open(id) {
      const r = find(id);
      if (r) open(r.id);
    },
    ids: () => data.HALL.map((r) => r.id),
  };

  let studio: Promise<Viewer> | null = null;
  const viewer = (): Promise<Viewer> => {
    studio ??= import('./studio').then((m) => m.createViewer(h));
    studio.catch(() => (studio = null));
    return studio;
  };
  let current: Viewer | null = null;
  h.modes.register('viewer', {
    async enter(arg?: unknown) {
      const a = (arg ?? {}) as ViewerEnterArg;
      const r = a.robot ? find(a.robot) : undefined;
      h.ui.busy(true);
      try {
        current = await viewer();
      } finally {
        h.ui.busy(false);
      }
      if (h.modes.current !== 'viewer') return;
      await current.enter(r?.id ?? null);
    },
    exit() {
      current?.exit();
    },
  });

  // tools (tools/discover/viewer.mjs): the viewer's own state
  (window as unknown as { __discoverViewer?: unknown }).__discoverViewer = {
    state: () => current?.state() ?? { open: false, ids: data.HALL.map((r) => r.id) },
    amberShown: data.HALL.some((r) => r.amber),
  };
}
