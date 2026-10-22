/**
 * Area manifests (Phase 7 plan §5.2, §5.6): the small, EAGER half of every area.
 *
 *   src/zones/<id>/manifest.ts   export default defineManifest({ id, kind, frame, title, stations, … })
 *   src/zones/<id>/index.ts      import manifest from './manifest';
 *                                export default defineZone({ ...manifest, init(ctx) { … } })
 *
 * The engine imports every manifest before the title (one eager glob in ZoneManager.ts) and the
 * area code later, through a priority queue: the resume or deep-link area before the title, island
 * areas nearest first after it, ground areas once they are reachable. So rotor states, the star
 * pool and the save migration work before any zone code has loaded. A manifest must stay data:
 * import nothing from the zone's own code (that would pull it into the first load).
 *
 * A manifest-only area (no index.ts yet) reserves its plot and counts for the pool; it registers
 * no stamps and builds nothing.
 */
import type { Vec3Input } from '../types';

/** 'lobe' = the six island zones (the rc4 scope 'island'); 'hall' = an island hall; 'site' = a ground area. */
export type PlotKind = 'lobe' | 'hall' | 'site';
/** The frame an area lives in (§2.1): the island never moves, the ground frame does. */
export type PlotFrame = 'island' | 'ground';
/** A station's part in the objective route of a mode (§1.3, §1.4). */
export type RouteRole = 'main' | 'side' | 'skip';

// System ids live with the manifests, so the wave-0 stubs can name them; src/core/quest/types.ts (WP1)
// re-exports them (D23).
/** AUFTRIEB: the six main rotors, in the order of ZONE_PLOTS and underside.ts. */
export type RotorId = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6';
/** ENERGIE: the Startakku (Sonnenacker) · NAVIGATION: the Flugmodell (Traumhangar). */
export type CoreId = 'AKKU' | 'NAV';
/** The four trim rotors under the Kanzeln (D7): cosmetic, they never gate. */
export type TrimId = 'T1' | 'T2' | 'T3' | 'T4';
export type SystemId = RotorId | CoreId | TrimId;

export const ROTOR_IDS: readonly RotorId[] = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'];
export const CORE_IDS: readonly CoreId[] = ['AKKU', 'NAV'];
export const TRIM_IDS: readonly TrimId[] = ['T1', 'T2', 'T3', 'T4'];

/** Names in manifests are plain { de, en } (the island and the Pass read them before any string table exists). */
export interface ManifestText {
  de: string;
  en: string;
}

export interface StationManifest {
  /** stamp id '<areaId>.<id>' */
  id: string;
  /** the area's ◆ (it starts the area's system: a rotor, AKKU, NAV or a trim). The field keeps its rc4 name. */
  star?: boolean;
  /** Pass title; default: the string key 'zone.<areaId>.<id>.title' once the zone registered it, else the id */
  title?: ManifestText;
  /** goals changed: a stored record with another rev resets (boot migration, §3.5) */
  rev?: number;
  /** counts for the H2 pool (default true) */
  mastery?: boolean;
  /** objective route per mode (defaults: Entdecker main; Entscheider main for ◆, skip otherwise) */
  route?: { entdecker?: RouteRole; entscheider?: RouteRole };
}

export interface AreaManifest {
  /** = the folder name src/zones/<id>/ (kebab-case) */
  id: string;
  kind: PlotKind;
  frame: PlotFrame;
  title: ManifestText;
  number?: number;
  verb?: ManifestText;
  eyebrow?: ManifestText;
  /** HUD/map glyph id: sensor | pendel | greifer | band | kiste | kurve */
  glyph?: string;
  /** the area's stations (three in the GDD arc A, B, C) — registered as Pass stamps once the area has code */
  stations: readonly StationManifest[];
  /** vendor-question cards this area awards */
  questions?: readonly number[];
  /** hidden Failure-Mode-Album entry id */
  album?: string;
  /** what this area's ◆ starts: M1–M6 (lobes), 'AKKU' (sonnenacker), 'NAV' (traumhangar), a trim (kreislaufhof T1, unkrautacker T4) */
  system?: SystemId;
  /** the checklist line of that system */
  systemLabel?: ManifestText;
  /** a cosmetic trim started by the same ◆ (sonnenacker 'T3', traumhangar 'T2') */
  trim?: TrimId;
  /** certificate back side „Was du unten gesehen hast“ (§2.8) */
  takeaway?: ManifestText;
  /** railing gaps in local degrees (0 = local −z, clockwise from above); the island builds its railings before zone code loads */
  railingGaps?: readonly { fromDeg: number; toDeg: number }[];
  /** spawn used by ?zone=<id> / ?area=<id> and the resume gate (local coords, yaw in degrees, 0 = facing local −Z) */
  spawn?: { position: Vec3Input; yawDeg?: number; pitchDeg?: number };
}

/** Identity helper (type checking only). Keep it a function declaration: manifests are evaluated by an eager glob. */
export function defineManifest(m: AreaManifest): AreaManifest {
  return m;
}

/** The ◆ station of an area (null when it has none). */
export function starStation(m: Pick<AreaManifest, 'stations'>): StationManifest | null {
  return m.stations.find((s) => s.star) ?? null;
}

/** The objective-route role of a station in a mode (the defaults of StationManifest.route). */
export function routeRole(s: StationManifest, mode: 'entdecker' | 'entscheider'): RouteRole {
  const r = s.route?.[mode];
  if (r) return r;
  return mode === 'entdecker' || s.star ? 'main' : 'skip';
}
