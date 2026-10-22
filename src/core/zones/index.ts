/**
 * Public entry point for zone code:
 *
 *   // src/zones/my-zone/manifest.ts — eager, data only (Phase 7 plan §5.2)
 *   import { defineManifest } from '@/core/zones';
 *   export default defineManifest({ id: 'my-zone', kind: 'lobe', frame: 'island', title: { de: 'Meine Zone', en: 'My zone' }, stations: [] });
 *
 *   // src/zones/my-zone/index.ts — lazy code
 *   import * as THREE from 'three';
 *   import { defineZone } from '@/core/zones';
 *   import manifest from './manifest';
 *
 *   export default defineZone({
 *     ...manifest,
 *     init(ctx) { … build under ctx.root in local coordinates … },
 *     update(dt, ctx) { … },
 *   });
 *
 * See docs/ARCHITECTURE.md for the full guide.
 */
import type { ZoneDefinition } from './types';

export function defineZone(def: ZoneDefinition): ZoneDefinition {
  return def;
}

export type * from './types';
// Phase 7 (plan §5.2, §6.2): the eager manifests, the context extensions, one line per package types file
export { defineManifest, starStation, routeRole, ROTOR_IDS, CORE_IDS, TRIM_IDS } from './manifest';
export type * from './manifest';
export { registerContextExtension, type AreaHandle, type ZoneContextExtensions } from './ext';
export type * from './types.quest';
export type * from './types.frames';
export type * from './types.robots';
export type * from './types.env';
export type { InteractableOptions, InteractableHandle } from '@/systems/Interaction';
export type { LoopHandle, LoopOptions } from '@/systems/Audio';
export type { InfoCardSpec, InfoCardContent, InfoCardMetric, InfoCardDiagram } from '@/ui/Modals';
export type { PanelHandle, PanelOptions, PanelRow, ToastOptions } from '@/ui/Hud';
export type { WorldLabelHandle, WorldLabelOptions } from '@/ui/WorldLabels';
export type { CompassMarkerHandle } from '@/ui/Compass';
export type { LocalizedTables, StringTable } from '@/i18n/I18n';
export { palette, css } from '../brand/palette';
export { createLogoMark, recamanArcs, logoSvg } from '../brand/logo3d';
export { mulberry32 } from '../brand/textures';
