/**
 * The Schauhalle viewer's data shapes (WP-D2): what tools/discover/robots-data.mjs writes into
 * src/discover/data/robots.gen.ts. Plain data, types only.
 */
import type { ChipType, RobotId } from '../types';

/** a text in both languages */
export interface Bi {
  readonly de: string;
  readonly en: string;
}

/** a copied text and where it was copied from */
export interface FromText extends Bi {
  readonly from: string;
}

/** one row of the hall's Datenblatt (sheet(), src/zones/schauhalle/sheet.ts) in both languages */
export interface GenRow {
  readonly label: Bi;
  /** null = „k. A.“ */
  readonly value: Bi | null;
  readonly chip: ChipType | null;
  /** the condition of the number (payload), or the amber line on the licence row */
  readonly cond: Bi | null;
}

export type HallCategory = 'gehen' | 'greifen' | 'bauen';

export interface GenRobot {
  readonly id: RobotId;
  readonly cat: HallCategory;
  /** an amber exhibit (only with VITE_AMBER=1) */
  readonly amber: boolean;
  /** the hall's order (INSPECT_ORDER with the amber exhibits) */
  readonly order: number;
  readonly name: Bi;
  readonly short: string;
  /** „// GEHEN“ */
  readonly catLabel: Bi;
  /** „PILOT“ */
  readonly status: Bi;
  /** „Humanoid · läuft“ */
  readonly kind: GenRow;
  /** „Kann heute“ with its chip and source label */
  readonly can: { readonly label: Bi; readonly value: Bi | null; readonly chip: ChipType | null; readonly src: string | null };
  readonly rows: {
    readonly size: GenRow;
    /** the height measured on the 3D model (MODELL) */
    readonly model: GenRow;
    readonly payload: GenRow;
    readonly source: GenRow;
    /** SPDX · attribution (legally required); cond = the amber line */
    readonly license: GenRow;
  };
  /** „Stand 17.10.2026“ */
  readonly asOf: Bi;
  /** model height (m) in the default pose (src/robots/manifest.ts) */
  readonly heightM: number;
  /** conservative sphere for any pose (glTF frame: y up, front +z, floor y = 0) */
  readonly bounds: { readonly c: readonly number[]; readonly r: number };
  readonly from: string;
}

export interface ViewerText {
  readonly hall: FromText;
  readonly eyebrow: FromText;
  readonly tabs: Readonly<Record<HallCategory, FromText>>;
  readonly du: FromText;
  readonly emi: FromText;
  readonly wallLine: FromText;
  readonly modelRow: FromText;
  /** „k. A.“: a row the vendor does not state */
  readonly ka: FromText;
}
