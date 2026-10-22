/**
 * Price bands (D17, plan §4.9; assignments from R4 §3, the H2 conflict shown as both sources [C2 m4]).
 * A band, never an exact quote: „Preisklasse (Listenpreis, US-$ oder €, ohne Steuern und Versand)“,
 * with its basis and date on every plate. The bands are wide enough that the currency moves no listed
 * robot across an edge. Robots without a public list price stay „auf Anfrage“; a dated secondary source
 * (distributor list, press, tender) turns that into „auf Anfrage · {Band} laut {Quelle}, Stand {Datum}“
 * — unused so far: WP18 checked R1–R9 on 2026-10-19 and found no dated secondary price for any robot
 * „auf Anfrage“ (docs/RELEASE.md §5, Phase 7). No price of EmAI's own services anywhere (D5).
 */
import type { RobotId } from '@/core/zones';
import type { Bi } from './robots';
import { AS_OF, sourceDate, type SourceId } from './sources';

export type Band = 'u1k' | '1k-10k' | '10k-50k' | '50k-150k' | 'o150k' | 'anfrage';

export const BAND_LABEL: Record<Band, Bi> = {
  u1k: { de: 'unter 1.000', en: 'under 1,000' },
  '1k-10k': { de: '1.000–10.000', en: '1,000–10,000' },
  '10k-50k': { de: '10.000–50.000', en: '10,000–50,000' },
  '50k-150k': { de: '50.000–150.000', en: '50,000–150,000' },
  o150k: { de: 'über 150.000', en: 'over 150,000' },
  anfrage: { de: 'auf Anfrage', en: 'on request' },
};

/**
 * basis: 'liste' = the vendor's list price · 'quelle' = a dated secondary source (press, a parts list,
 * a launch price) · 'anfrage' = no public price.
 */
export interface Price {
  band: Band;
  basis: 'liste' | 'quelle' | 'anfrage';
  source: SourceId | null;
  date: { iso: string; de: string; en: string };
  /** the figure behind the band, shown on „Mehr“ with its chip */
  figure?: Bi;
  /** a second, conflicting source (H2: vendor vs reseller) */
  also?: { upTo: Bi; source: SourceId };
  /** „historisch“ (Spot's 2020 launch price) */
  historical?: boolean;
  /** the band follows the plan's assignment without a figure in the research (WP18, 2026-10-19: none in R1–R9, „Quelle fehlt“ in docs/RELEASE.md §5) */
  unsourcedFigure?: boolean;
}

const at = (id: SourceId): Price['date'] => sourceDate(id);
const anfrage: Price = { band: 'anfrage', basis: 'anfrage', source: null, date: AS_OF };

export const PRICES: Record<RobotId, Price> = {
  so101: { band: 'u1k', basis: 'quelle', source: 'S22', date: at('S22'), figure: { de: 'Teile ca. 122 US$ pro Folgearm; 229,88 US$ mit Leitarm', en: 'parts about US$122 per follower arm; US$229.88 with the leader arm' } },
  'so101-leader': { band: 'u1k', basis: 'quelle', source: 'S22', date: at('S22') },
  'open-duck-mini-v2': { band: 'u1k', basis: 'quelle', source: 'S21', date: at('S21'), figure: { de: 'Stückliste „unter 400 US$“, nur Teile', en: 'bill of materials "under $400", parts only' } },
  // plan §4.9 assigns „unter 1.000“ (parts); the research has no figure for the base (R8 S28: „low-cost“)
  'lekiwi-base': { band: 'u1k', basis: 'quelle', source: 'LK', date: AS_OF, unsourcedFigure: true },
  'unitree-r1': { band: '1k-10k', basis: 'liste', source: 'S32', date: at('S32'), figure: { de: 'US$ 5.900 (AIR US$ 4.900)', en: 'US$5,900 (AIR US$4,900)' } },
  'unitree-go2': { band: '1k-10k', basis: 'liste', source: 'S33', date: at('S33'), figure: { de: 'AIR US$ 1.600 · PRO US$ 2.800', en: 'AIR US$1,600 · PRO US$2,800' } },
  'unitree-g1': { band: '10k-50k', basis: 'liste', source: 'S29', date: at('S29'), figure: { de: 'ab US$ 13.500', en: 'from US$13,500' } },
  'unitree-g1-dex3': anfrage,
  'unitree-h1': anfrage,
  'unitree-h1-2': anfrage,
  'unitree-h2': { band: '10k-50k', basis: 'liste', source: 'S31', date: at('S31'), figure: { de: 'US$ 29.900 (Hersteller)', en: 'US$29,900 (vendor)' }, also: { upTo: { de: 'Händler bis ≈ 90.000', en: 'resale ≈ 90,000' }, source: 'S63' } },
  'stretch-3': { band: '10k-50k', basis: 'quelle', source: 'S51', date: at('S51'), figure: { de: 'US$ 24.950 Einführungspreis 2024', en: 'US$24,950 launch price 2024' } },
  spot: { band: '50k-150k', basis: 'quelle', source: 'S37', date: at('S37'), historical: true, figure: { de: 'US$ 74.500 Basis-Kit (2020)', en: 'US$74,500 base kit (2020)' } },
  'spot-arm': anfrage,
  'apptronik-apollo': anfrage,
  'pal-talos': anfrage,
  'anymal-d': anfrage,
  'pal-tiago': anfrage,
  mir250: anfrage,
  ur5e: anfrage,
  'franka-fr3': anfrage,
  'kuka-iiwa-14': anfrage,
  'fanuc-r2000ic-165f': anfrage,
  'shadow-hand': anfrage,
  'robotiq-2f85': anfrage,
};

/** „Preisklasse (Listenpreis, US-$ oder €, ohne Steuern und Versand)“ — the row label on „Mehr“. */
export const PRICE_LABEL: Bi = { de: 'Preisklasse (Listenpreis, US-$ oder €, ohne Steuern und Versand)', en: 'Price band (list price, US$ or €, excl. tax and shipping)' };
export const PRICE_NOT_INVOICE: Bi = { de: 'Ein Listenpreis ist nicht die Rechnung: Zubehör, Integration und Betrieb kommen dazu.', en: 'A list price is not the invoice: accessories, integration and operation come on top.' };
export const PRICE_ON_REQUEST: Bi = { de: 'Kein öffentlicher Listenpreis. Frag nach Zubehör, Integration und Betrieb.', en: 'No public list price. Ask about accessories, integration and operation.' };
