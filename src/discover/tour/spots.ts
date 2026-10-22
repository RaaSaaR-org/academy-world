/**
 * The hotspots (WP-D1, plan §3.3): world anchors with a card. Plain data (the stills tour lists them as
 * „Hier zu sehen“ chips too). Each spot is { id, at, r, stops }: `at` one or more anchor points (the
 * marker sits on the nearest one in view), `r` the pick radius (m) around them, `stops` where it is
 * shown, `ground` when the points' y is above the terrain there (fitted at run time). The robots are
 * hotspots of their own (picked on their meshes, cards from D2).
 */
import type { Vec3 } from '../types';
import { ANCHORS } from '../data/content.gen';

export interface SpotData {
  id: string;
  at: readonly Vec3[];
  r: number;
  stops: readonly string[];
  ground?: boolean;
  /** content id of its card (content.gen.ts CARDS / CARD_ALIAS) */
  card: string;
}

const D = Math.PI / 180;
const polar = (b: number, r: number, y = 0): Vec3 => [Math.sin(b * D) * r, y, -Math.cos(b * D) * r];
const v = (a: readonly number[], dy = 0): Vec3 => [a[0], a[1] + dy, a[2]];
const site = (id: string): Vec3 => v(ANCHORS.sites.find((s) => s.id === id)!.anchor);

const RAW: Omit<SpotData, 'card'>[] = [
  // the Recamán relief's centre, a metre in front of its face
  { id: 'turm', at: [v(ANCHORS.sculpture, 0)].map((p) => [p[0], p[1], p[2] + 1] as Vec3), r: 9, stops: ['brueckenkopf', 'libelle'] },
  { id: 'libelle', at: [v(ANCHORS.libelle, 1.6)], r: 3, stops: ['brueckenkopf'] },
  // the six holding arms at the lobe tips (y: their hinge, src/world/ground/arms.ts)
  { id: 'haltearme', at: ANCHORS.arms.bearings.map((b) => polar(b, (ANCHORS.arms.fromR + ANCHORS.arms.toR) / 2, -0.5)), r: 5, stops: ['dock', 'brueckenkopf'] },
  // M1–M6 under the lobes (plan §3.3: polar(b, 80, −12))
  { id: 'rotoren', at: ANCHORS.zones.map((z) => polar(z.bearing, 80, -12)), r: 8, stops: ['dock', 'zonen-west', 'zonen-nord', 'zonen-ost'] },
  { id: 'glasbalkon', at: [v(ANCHORS.glasbalkon, 1)], r: 6, stops: ['zonen-nord', 'schauhalle'] },
  { id: 'grubenrand', at: [v(ANCHORS.grubenrand, 18)], r: 14, stops: ['ausguck', 'sonnenacker'], ground: true },
  // far sites: the region chunk's impostors, text only (a marker over each)
  { id: 'kreislaufhof', at: [site('kreislaufhof')].map((p) => [p[0], 10, p[2]] as Vec3), r: 35, stops: ['dock'], ground: true },
  { id: 'unkrautacker', at: [site('unkrautacker')].map((p) => [p[0], 4, p[2]] as Vec3), r: 80, stops: ['ausguck', 'grubenrand', 'abheben'], ground: true },
];

export const SPOTS: readonly SpotData[] = RAW.map((s) => ({ ...s, card: `spot:${s.id}` }));

export const spotById = (id: string): SpotData | undefined => SPOTS.find((s) => s.id === id);
