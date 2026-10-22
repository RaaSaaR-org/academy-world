/**
 * The sources behind every number in the Schauhalle (plan §4.9, R4 §15, R3, R8; all accessed on the
 * date below). Cards show the label and the date, never a live link: nothing is fetched from another
 * origin (D-zero-requests). Ids keep the research report's numbering, so a reviewer can follow a row
 * back to its report: R4 S29 … S63, R3 U-H1, R8 S28.
 */

/** „Stand 17.10.2026“: the date R4 read every vendor page (plan §4.9, R4 §6 „Spec and price freshness“). */
export const AS_OF = { iso: '2026-10-17', de: '17.10.2026', en: '2026-10-17' } as const;

export interface Source {
  /** short label for the card's „Quelle“ row (no URL scheme) */
  label: string;
  /** the report and its id, for reviewers (tools/hall-check prints it) */
  ref: string;
  url: string;
  /** a secondary source (press, distributor, search snippet) — its values carry QUELLE, not HERSTELLERANGABE */
  secondary?: boolean;
  /** the report marks the value as unverified */
  unverified?: boolean;
  /** a source date other than AS_OF (historical prices) */
  date?: { iso: string; de: string; en: string };
}

export const SOURCES = {
  S21: { label: 'github.com/apirrone/Open_Duck_Mini (README)', ref: 'R4 S21', url: 'https://github.com/apirrone/Open_Duck_Mini/tree/b23317a485b3cec7d8417f352478778b3475173c' },
  S22: { label: 'github.com/TheRobotStudio/SO-ARM100 (README, Teileliste)', ref: 'R4 S22', url: 'https://github.com/TheRobotStudio/SO-ARM100' },
  S29: { label: 'unitree.com/g1', ref: 'R4 S29', url: 'https://www.unitree.com/g1/' },
  S31: { label: 'unitree.com/H2', ref: 'R4 S31', url: 'https://www.unitree.com/H2/' },
  S32: { label: 'unitree.com/R1', ref: 'R4 S32', url: 'https://www.unitree.com/R1/' },
  S33: { label: 'unitree.com/go2', ref: 'R4 S33', url: 'https://www.unitree.com/go2/' },
  S35: { label: 'bostondynamics.com/products/spot', ref: 'R4 S35', url: 'https://bostondynamics.com/products/spot/' },
  S36: { label: 'bostondynamics.com/products/spot/arm', ref: 'R4 S36', url: 'https://bostondynamics.com/products/spot/arm/' },
  S37: { label: 'TechCrunch, 16.06.2020', ref: 'R4 S37', url: 'https://techcrunch.com/2020/06/16/now-any-us-business-can-buy-boston-dynamics-spot-robot-for-74500', secondary: true, date: { iso: '2020-06-16', de: '16.06.2020', en: '2020-06-16' } },
  S38: { label: 'anybotics.com, Datenblatt ANYmal D (US)', ref: 'R4 S38', url: 'https://www.anybotics.com/ANYbotics_Specs_US.pdf' },
  S39: { label: 'anybotics.com/robotics/anymal', ref: 'R4 S39', url: 'https://www.anybotics.com/robotics/anymal/' },
  S40: { label: 'universal-robots.com, Datenblatt UR5e', ref: 'R4 S40', url: 'https://www.universal-robots.com/manuals/latest/en/datasheets/ur5e/' },
  S41: { label: 'franka.de/franka-research-3 (Datenblatt 2.6)', ref: 'R4 S41', url: 'https://franka.de/franka-research-3' },
  S42: { label: 'kuka.com, LBR iiwa', ref: 'R4 S42', url: 'https://www.kuka.com/en-de/products/robot-systems/industrial-robots/lbr-iiwa' },
  S43: { label: 'RoboDK, LBR iiwa 14 R820', ref: 'R4 S43', url: 'https://robodk.com/robot/KUKA/LBR-iiwa-14-R820', secondary: true, unverified: true },
  S44: { label: 'fanucamerica.com, R-2000iC/165F', ref: 'R4 S44', url: 'https://www.fanucamerica.com/products/robots/series/r-2000/r-2000ic-165f' },
  S47: { label: 'mobile-industrial-robots.com/mir250', ref: 'R4 S47', url: 'https://mobile-industrial-robots.com/products/robots/mir250' },
  S48: { label: 'Händlerdatenblätter MiR250', ref: 'R4 S48', url: 'https://konicaminolta.com.au/products/robotics/mir250', secondary: true, unverified: true },
  S49: { label: 'pal-robotics.com/robot/talos', ref: 'R4 S49', url: 'https://pal-robotics.com/robot/talos/' },
  S50: { label: 'pal-robotics.com/robot/tiago', ref: 'R4 S50', url: 'https://pal-robotics.com/robot/tiago/' },
  S51: { label: 'IEEE Spectrum, 15.02.2024', ref: 'R4 S51', url: 'https://spectrum.ieee.org/hello-robot-stretch-3', secondary: true, date: { iso: '2024-02-15', de: '15.02.2024', en: '2024-02-15' } },
  S52: { label: 'docs.hello-robot.com (Suchauszug)', ref: 'R4 S52', url: 'https://docs.hello-robot.com/0.3/hardware/hardware_guide_stretch_3', secondary: true, unverified: true },
  S53: { label: 'Engadget, 2023', ref: 'R4 S53', url: 'https://www.engadget.com/apptroniks-apollo-is-the-latest-humanoid-robot-to-beat-tesla-to-market-164246161.html', secondary: true },
  S55: { label: 'apptronik.com', ref: 'R4 S55', url: 'https://apptronik.com/' },
  S56: { label: 'shadowrobot.com, Dexterous Hand', ref: 'R4 S56', url: 'https://www.shadowrobot.com/dexterous-hand-series/' },
  S57: { label: 'Robotiq, Produktblatt Adaptive Grippers', ref: 'R4 S57', url: 'https://blog.robotiq.com/hubfs/Product-sheets/Adaptive%20Grippers/Product-sheet-Adaptive-Grippers-EN.pdf' },
  S58: { label: 'robotiq.com, Adaptive Grippers', ref: 'R4 S58', url: 'https://robotiq.com/products/adaptive-grippers' },
  S62: { label: 'RedHotCyber, 20.10.2025', ref: 'R4 S62', url: 'https://www.redhotcyber.com/?p=137562', secondary: true, unverified: true },
  S63: { label: 'humanoid.guide, H2', ref: 'R4 S63', url: 'https://humanoid.guide/product/h2/', secondary: true, unverified: true },
  /** R3: the H1 page carries the H1-2 figures (rated ≈ 7 kg, peak ≈ 21 kg, < 2 m/s, 27 DoF) */
  UH1: { label: 'unitree.com/h1 (H1-2)', ref: 'R3 U-H1', url: 'https://www.unitree.com/h1' },
  /** R8 S28: LeKiwi, an open low-cost mobile manipulator (Apache-2.0, URDF) */
  LK: { label: 'github.com/SIGRobotics-UIUC/LeKiwi', ref: 'R8 S28', url: 'https://github.com/SIGRobotics-UIUC/LeKiwi' },
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

/** The source's date for a card („Stand …“): its own date for historical sources, else AS_OF. */
export function sourceDate(id: SourceId): { iso: string; de: string; en: string } {
  const s: Source = SOURCES[id];
  return s.date ?? AS_OF;
}
