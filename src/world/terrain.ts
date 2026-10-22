import type { ZoneContext } from '@/core/zones';
import { buildLandscape, type Landscape } from './landscape';

/**
 * The free deck between plots and paths (ART-V2 §4.1, QA-07): the island is a robot, so the
 * pines, heath mounds and boulders are gone. The deck stays flat (y = 0) and carries functional
 * fields instead: PV tracker rows, cooling-air intakes, heat-exchanger fin banks, hydroponic pods,
 * rim sensor masts, drone docks, service hatches and maintenance rovers (src/world/landscape/).
 */
export { freeDistance } from './landscape/plan';

export function buildTerrain(ctx: ZoneContext, step?: () => Promise<void>): Promise<Landscape> {
  return buildLandscape(ctx, step);
}
