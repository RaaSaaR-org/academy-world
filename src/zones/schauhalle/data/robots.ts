/**
 * The Schauhalle line-up (plan §4.9; R4 §2, R3 §1 for the H1-2, R8 S28 for LeKiwi): 21 real robots (17 in a
 * build without the amber exhibits, see below), each
 * the real published 3D model through ctx.robots (never a look-alike), with the rows of its Datenblatt.
 * Every number here has a chip and a source (sources.ts); a row the vendor does not state is null and
 * reads „k. A.“ on the card. Model-derived values carry MODELL and never stand in for a vendor value
 * (the height the Messlatte measures is computed from the manifest at run time, not typed here).
 *
 * `facts` are the stated values the Lastenheft judges (jobs.ts): only numbers that a row of the same
 * card shows, so the deciding row the player taps always holds the number that decided.
 *
 * Amber models (R4 §4: Spot, MiR250, KUKA LBR iiwa 14, Robotiq 2F-85) are plain exhibits [C2 m9]: no
 * delivery or load point depends on them, so a legal „no“ removes four plinths. They stand in the hall only
 * when the build sets VITE_AMBER=1 (src/core/release.ts, docs/LEGAL-REVIEW.md item 2); without them the
 * hall keeps their places empty, their Lastenheft jobs leave the pool (jobs.ts) and a round tops up with a
 * second „Keiner passt“ job when too few robots stand (lastenheft.ts).
 */
import type { RobotId } from '@/core/zones';
import { SHOW_AMBER } from '@/core/release';
import type { SourceId } from './sources';

export type Bi = { readonly de: string; readonly en: string };
export type RowChip = 'herstellerangabe' | 'quelle' | 'modell';
/** one value on a card: text in both languages, its chip, its source, an optional condition */
export interface Val {
  readonly de: string;
  readonly en: string;
  readonly chip: RowChip;
  readonly src?: SourceId;
  /** the condition that belongs to the number (plan §4.9: „Nutzlast with its condition“) */
  readonly cond?: Bi;
}
export type RowKey = 'size' | 'weight' | 'dof' | 'payload' | 'reach' | 'speed' | 'runtime' | 'env' | 'kind' | 'can';
export type ValueRow = Exclude<RowKey, 'kind' | 'can'>;
export const VALUE_ROWS: readonly ValueRow[] = ['size', 'weight', 'dof', 'payload', 'reach', 'speed', 'runtime', 'env'];

export type Category = 'gehen' | 'greifen' | 'bauen';
export type Status = 'lieferbar' | 'pilot' | 'selbstbau' | 'angekuendigt' | 'ka';
/** what brings the robot into the hall (plan §4.9 „Line-up and deliveries“) */
export type Arrival =
  | { kind: 'bestand' }
  | { kind: 'rotor'; id: 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' }
  | { kind: 'traum'; station: 0 | 1 | 2 }
  | { kind: 'stars' }
  | { kind: 'h2' };
export type PlinthKind = 'turntable' | 'turntable-small' | 'column' | 'fixed' | 'low';

export interface Facts {
  readonly moves: 'laeuft' | 'faehrt' | 'fest';
  /** it has an arm or a hand that can lift (an AMR carries, it does not lift) */
  readonly lifts: boolean;
  readonly humanoid?: boolean;
  readonly quadruped?: boolean;
  readonly arm?: boolean;
  /** headline payload (kg) as the payload row states it */
  readonly payloadKg?: number;
  /** rated (continuous) load per arm (kg) for humanoids */
  readonly perArmKg?: number;
  /** first digit of the IP code (dust) */
  readonly ip?: number;
  readonly stairsDeg?: number;
  readonly tempMinC?: number;
  readonly reachMm?: number;
  /** torque sensing in every joint (or every axis) as the card says */
  readonly torqueAll?: boolean;
  /** an open project you can build yourself */
  readonly open?: boolean;
  /** made for the LeRobot library (R4 S22) */
  readonly lerobot?: boolean;
}

export interface HallRobot {
  readonly id: RobotId;
  /** short name for labels and the Lastenheft („Unitree G1“ is the manifest's full name) */
  readonly short: string;
  readonly cat: Category;
  readonly kind: Bi;
  readonly status: Status;
  readonly statusSrc?: SourceId;
  readonly arrival: Arrival;
  readonly amber?: boolean;
  /** plinth centre (hall-local x, z), the robot's facing (deg about +y; 0 = its front toward +z, the entrance) */
  readonly at: readonly [number, number];
  readonly yawDeg: number;
  readonly plinth: PlinthKind;
  /** the card rows (null = „k. A.“) */
  readonly rows: { readonly [K in ValueRow]: Val | null };
  /** R4 §2.3: „Kann heute“ / „Grenzen“ (each with the chip of the numbers it holds) */
  readonly can: Val;
  readonly limits: Val;
  readonly facts: Facts;
  /** „Probefahrt“: the station that plays this robot (plan §4.9) */
  readonly probefahrt?: { readonly area: string; readonly label: Bi };
  /** a load point of the Kistenwaage stands at this robot (green models only, C2 m9) */
  readonly loadPoint?: boolean;
}

const HA = 'herstellerangabe' as const;
const QU = 'quelle' as const;
const MO = 'modell' as const;
const v = (de: string, en: string, chip: RowChip, src?: SourceId, cond?: Bi): Val => ({ de, en, chip, src, cond });
const bi = (de: string, en: string): Bi => ({ de, en });

const TRAUM = { area: 'traumhangar', label: bi('Probefahrt im Traumhangar', 'Test drive in the Dream Hangar') };

/**
 * Positions (plan §4.9 layout, R4 §7.2): GEHEN west of the aisle, GREIFEN & FAHREN east, SELBST BAUEN in
 * front of the „Danke“ room (north-east). West robots face the aisle (+x, yaw 90), east robots face it
 * from the other side (yaw −90).
 */
const ALL_HALL_ROBOTS: readonly HallRobot[] = [
  // ── GEHEN ────────────────────────────────────────────────────────────────────────────────
  {
    id: 'apptronik-apollo',
    short: 'Apollo',
    cat: 'gehen',
    kind: bi('Humanoid', 'Humanoid'),
    status: 'pilot',
    statusSrc: 'S55',
    arrival: { kind: 'stars' },
    at: [-9.4, -6.0],
    yawDeg: 90,
    plinth: 'turntable',
    rows: {
      size: v('1,73 m', '1.73 m', QU, 'S53'),
      weight: v('72,6 kg', '72.6 kg', QU, 'S53'),
      dof: null,
      payload: v('25 kg', '25 kg', QU, 'S53', bi('Bedingung nicht angegeben', 'condition not stated')),
      reach: null,
      speed: null,
      runtime: v('ca. 4 h pro Akku', 'about 4 h per pack', QU, 'S53'),
      env: null,
    },
    can: v('Für Kisten und Material in Werk und Lager gebaut; Akku tauschbar.', 'Built for crates and material in plants and warehouses; swappable battery.', HA, 'S55'),
    limits: v('Noch im Pilotbetrieb; 25 kg Hebeleistung nur aus Presseberichten.', 'Still in pilots; the 25 kg lift comes from press reports only.', QU, 'S53'),
    facts: { moves: 'laeuft', lifts: true, humanoid: true, payloadKg: 25 },
  },
  {
    id: 'pal-talos',
    short: 'TALOS',
    cat: 'gehen',
    kind: bi('Humanoid (Forschung)', 'Humanoid (research)'),
    status: 'lieferbar',
    statusSrc: 'S49',
    arrival: { kind: 'bestand' },
    at: [-5.2, -6.0],
    yawDeg: 90,
    plinth: 'turntable',
    rows: {
      size: v('1,75 m', '1.75 m', HA, 'S49'),
      weight: v('95 kg', '95 kg', HA, 'S49'),
      dof: v('Drehmomentsensoren in allen Gelenken außer Kopf, Handgelenken, Greifern', 'torque sensors in all joints but head, wrists and grippers', HA, 'S49'),
      payload: v('6 kg pro Arm', '6 kg per arm', HA, 'S49', bi('bei gestrecktem Arm', 'arm stretched')),
      reach: null,
      speed: null,
      runtime: v('1,5 h Laufen · 3 h Standby', '1.5 h walking · 3 h standby', HA, 'S49'),
      env: v('Regeltakt 2 kHz (EtherCAT)', 'control loop at 2 kHz (EtherCAT)', HA, 'S49'),
    },
    can: v('Spürt Drehmoment in fast jedem Gelenk; Regeltakt 2 kHz.', 'Senses torque in almost every joint; control loop at 2 kHz.', HA, 'S49'),
    limits: v('1,5 h Laufen, 95 kg; 6 kg pro Arm bei gestrecktem Arm.', '1.5 h of walking, 95 kg; 6 kg per arm with the arm stretched.', HA, 'S49'),
    facts: { moves: 'laeuft', lifts: true, humanoid: true, perArmKg: 6, torqueAll: true },
  },
  {
    id: 'unitree-h1-2',
    short: 'H1-2',
    cat: 'gehen',
    kind: bi('Humanoid', 'Humanoid'),
    status: 'ka',
    arrival: { kind: 'traum', station: 2 },
    at: [-9.4, -1.8],
    yawDeg: 90,
    plinth: 'turntable',
    rows: {
      size: v('ca. 1,78 m', '≈ 1.78 m', HA, 'UH1'),
      weight: v('ca. 70 kg', 'about 70 kg', HA, 'UH1'),
      dof: v('27 Gelenke, 7 pro Arm', '27 joints, 7 per arm', HA, 'UH1'),
      payload: v('ca. 7 kg pro Arm', '≈ 7 kg per arm', HA, 'UH1', bi('Nennlast; Spitze ca. 21 kg nur kurz', 'rated; brief peaks ≈ 21 kg')),
      reach: null,
      speed: v('unter 2 m/s', 'below 2 m/s', HA, 'UH1'),
      runtime: null,
      env: null,
    },
    can: v('27 Gelenke, Arme mit 7 Gelenken, ca. 7 kg Nennlast pro Arm.', '27 joints, 7-joint arms, about 7 kg rated load per arm.', HA, 'UH1'),
    limits: v('21 kg nur als Spitze; keine Laufzeit angegeben.', '21 kg is peak only; no runtime stated.', HA, 'UH1'),
    facts: { moves: 'laeuft', lifts: true, humanoid: true, perArmKg: 7 },
    probefahrt: TRAUM,
  },
  {
    id: 'unitree-g1',
    short: 'G1',
    cat: 'gehen',
    kind: bi('Humanoid', 'Humanoid'),
    status: 'lieferbar',
    statusSrc: 'S29',
    arrival: { kind: 'traum', station: 1 },
    at: [-5.2, -1.8],
    yawDeg: 90,
    plinth: 'turntable',
    rows: {
      size: v('1,32 m', '1.32 m', HA, 'S29'),
      weight: v('ca. 35 kg', 'about 35 kg', HA, 'S29'),
      dof: v('23 (EDU bis 43)', '23 (EDU up to 43)', HA, 'S29'),
      payload: v('ca. 2 kg pro Arm', 'about 2 kg per arm', HA, 'S29', bi('„variiert stark mit der Armhaltung“', '"varies greatly with arm posture"')),
      reach: null,
      speed: null,
      runtime: v('ca. 2 h (9000 mAh)', 'about 2 h (9000 mAh)', HA, 'S29'),
      env: null,
    },
    can: v('Läuft mit 23 Gelenken (EDU bis 43), Tiefenkamera und 3D-LiDAR an Bord.', 'Walks on 23 joints (EDU up to 43), with a depth camera and a 3D LiDAR.', HA, 'S29'),
    limits: v('ca. 2 kg pro Arm, „variiert stark mit der Armhaltung“; ca. 2 h Akku.', 'About 2 kg per arm, "varies greatly with arm posture"; about 2 h of battery.', HA, 'S29'),
    facts: { moves: 'laeuft', lifts: true, humanoid: true, perArmKg: 2 },
    probefahrt: TRAUM,
  },
  {
    id: 'unitree-r1',
    short: 'R1',
    cat: 'gehen',
    kind: bi('Humanoid', 'Humanoid'),
    status: 'lieferbar',
    statusSrc: 'S32',
    arrival: { kind: 'traum', station: 0 },
    at: [-9.4, 2.4],
    yawDeg: 90,
    plinth: 'turntable',
    rows: {
      size: v('1,23 m', '1.23 m', HA, 'S32'),
      weight: v('ca. 29 kg', 'about 29 kg', HA, 'S32'),
      dof: v('26 Gelenke', '26 joints', HA, 'S32'),
      payload: v('ca. 2 kg pro Arm', 'about 2 kg per arm', HA, 'S32', bi('stark haltungsabhängig', 'depends heavily on posture')),
      reach: null,
      speed: null,
      runtime: v('ca. 1 h', 'about 1 h', HA, 'S32'),
      env: null,
    },
    can: v('Steht und läuft mit 26 Gelenken, sieht mit Kamera, hört mit 4 Mikrofonen.', 'Stands and walks on 26 joints, with a camera and 4 microphones.', HA, 'S32'),
    limits: v('ca. 1 h Akku; ca. 2 kg pro Arm, stark haltungsabhängig.', 'About 1 h of battery; about 2 kg per arm, depending heavily on posture.', HA, 'S32'),
    facts: { moves: 'laeuft', lifts: true, humanoid: true, perArmKg: 2 },
    probefahrt: TRAUM,
  },
  {
    id: 'anymal-d',
    short: 'ANYmal D',
    cat: 'gehen',
    kind: bi('Vierbeiner (Inspektion)', 'Quadruped (inspection)'),
    status: 'lieferbar',
    statusSrc: 'S38',
    arrival: { kind: 'rotor', id: 'M1' },
    at: [-5.2, 2.4],
    yawDeg: 90,
    plinth: 'turntable',
    rows: {
      size: v('0,93 × 0,53 × 0,89 m (laufend)', '0.93 × 0.53 × 0.89 m (walking)', HA, 'S38'),
      weight: v('50,0 kg · 55,7 kg mit Inspektions-Nutzlast', '50.0 kg · 55.7 kg with inspection payload', HA, 'S38'),
      dof: v('12 Beingelenke + Schwenk-Neige-Kopf', '12 leg joints + a pan-tilt head', MO),
      payload: v('bis 10 kg', 'up to 10 kg', HA, 'S39', bi('nur Zusatzsensoren', 'extra sensors only')),
      reach: null,
      speed: v('0,75 m/s empfohlen · 1,3 m/s max.', '0.75 m/s recommended · 1.3 m/s max', HA, 'S38'),
      runtime: v('90–120 min pro Ladung', '90–120 min per charge', HA, 'S38'),
      env: v('IP67 · Treppen bis 45° · typisch −10 bis 50 °C', 'IP67 · stairs up to 45° · typically −10 to 50 °C', HA, 'S38'),
    },
    can: v('Inspiziert Anlagen selbstständig; Treppen bis 45°, Gitterroste, IP67.', 'Inspects plants on its own; stairs up to 45°, grated steps, IP67.', HA, 'S38'),
    limits: v('Empfohlen 0,75 m/s; 90–120 min pro Ladung.', '0.75 m/s recommended; 90–120 min per charge.', HA, 'S38'),
    facts: { moves: 'laeuft', lifts: false, quadruped: true, payloadKg: 10, ip: 6, stairsDeg: 45, tempMinC: -10 },
    loadPoint: true,
  },
  {
    id: 'spot',
    short: 'Spot',
    cat: 'gehen',
    kind: bi('Vierbeiner', 'Quadruped'),
    status: 'lieferbar',
    statusSrc: 'S35',
    arrival: { kind: 'bestand' },
    amber: true,
    at: [-9.4, 6.6],
    yawDeg: 90,
    plinth: 'turntable',
    rows: {
      size: v('1,10 × 0,50 m · Laufhöhe 0,61 m', '1.10 × 0.50 × 0.61 m (walking)', HA, 'S35'),
      weight: v('33,8 kg', '33.8 kg', HA, 'S35'),
      dof: v('12 Beingelenke', '12 leg joints', MO),
      payload: v('14 kg', '14 kg', HA, 'S35', bi('mit Arm: hebt 11 kg, zieht 25 kg', 'arm: lifts 11 kg, drags 25 kg')),
      reach: null,
      speed: v('1,6 m/s', '1.6 m/s', HA, 'S35'),
      runtime: v('90 min im Schnitt', '90 min on average', HA, 'S35'),
      env: v('IP54 · −20 bis 55 °C · Hänge ±30°', 'IP54 · −20 to 55 °C · ±30° slopes', HA, 'S35'),
    },
    can: v('Treppen, Gelände, −20 bis 55 °C, IP54; mit Arm hebt er bis 11 kg.', 'Stairs, rough ground, −20 to 55 °C, IP54; with the arm it lifts up to 11 kg.', HA, 'S35'),
    limits: v('14 kg Nutzlast; im Schnitt 90 min Laufzeit.', '14 kg payload; 90 min of runtime on average.', HA, 'S35'),
    facts: { moves: 'laeuft', lifts: false, quadruped: true, payloadKg: 14, ip: 5, tempMinC: -20 },
  },
  {
    id: 'unitree-go2',
    short: 'Go2',
    cat: 'gehen',
    kind: bi('Vierbeiner', 'Quadruped'),
    status: 'lieferbar',
    statusSrc: 'S33',
    arrival: { kind: 'bestand' },
    at: [-5.2, 6.6],
    yawDeg: 90,
    plinth: 'turntable',
    rows: {
      size: v('0,70 × 0,31 × 0,40 m (stehend)', '0.70 × 0.31 × 0.40 m (standing)', HA, 'S33'),
      weight: v('ca. 15 kg', 'about 15 kg', HA, 'S33'),
      dof: v('12 Gelenkmotoren', '12 joint motors', HA, 'S33'),
      payload: v('ca. 8 kg (PRO)', '≈ 8 kg (PRO)', HA, 'S33', bi('AIR ca. 7 kg; höchstens 10–12 kg', 'AIR ≈ 7 kg; at most 10–12 kg')),
      reach: null,
      speed: v('bis 3,5 m/s (PRO)', 'up to 3.5 m/s (PRO)', HA, 'S33'),
      runtime: v('1–2 h (8000 mAh)', '1–2 h (8000 mAh)', HA, 'S33'),
      env: v('Stufen 15–16 cm · Hänge 30–40°', 'steps 15–16 cm · slopes 30–40°', HA, 'S33'),
    },
    can: v('Läuft bis 3,5 m/s (PRO), steigt 16 cm Stufen und 40° Hänge.', 'Runs at up to 3.5 m/s (PRO), climbs 16 cm steps and 40° slopes.', HA, 'S33'),
    limits: v('ca. 8 kg Last; 1–2 h Akku (Standard).', 'About 8 kg of load; 1–2 h of battery (standard).', HA, 'S33'),
    facts: { moves: 'laeuft', lifts: false, quadruped: true, payloadKg: 8 },
  },
  // ── GREIFEN & FAHREN ─────────────────────────────────────────────────────────────────────
  {
    id: 'ur5e',
    short: 'UR5e',
    cat: 'greifen',
    kind: bi('Cobot', 'Cobot'),
    status: 'lieferbar',
    statusSrc: 'S40',
    arrival: { kind: 'bestand' },
    at: [4.8, -4.4],
    yawDeg: -90,
    plinth: 'turntable-small',
    rows: {
      size: v('Fuß ø 151 mm', 'base ø 151 mm', HA, 'S40'),
      weight: v('20,7 kg inkl. Kabel', '20.7 kg incl. cable', HA, 'S40'),
      dof: v('6 Gelenke', '6 joints', HA, 'S40'),
      payload: v('5 kg', '5 kg', HA, 'S40', bi('Nennlast laut Datenblatt', 'rated, per datasheet')),
      reach: v('850 mm', '850 mm', HA, 'S40'),
      speed: v('TCP bis 4 m/s · ± 0,03 mm genau', 'TCP up to 4 m/s · ± 0.03 mm repeatable', HA, 'S40'),
      runtime: null,
      env: v('IP54 · Kraftsensor am Werkzeugflansch', 'IP54 · force sensing at the tool flange', HA, 'S40'),
    },
    can: v('Arbeitet neben Menschen: 5 kg, 850 mm, ± 0,03 mm genau.', 'Works next to people: 5 kg, 850 mm, ± 0.03 mm repeatable.', HA, 'S40'),
    limits: v('Nur 5 kg; IP54.', 'Only 5 kg; IP54.', HA, 'S40'),
    facts: { moves: 'fest', lifts: true, arm: true, payloadKg: 5, reachMm: 850, ip: 5, torqueAll: false },
    loadPoint: true,
  },
  {
    id: 'franka-fr3',
    short: 'FR3',
    cat: 'greifen',
    kind: bi('Cobot (Forschung)', 'Cobot (research)'),
    status: 'lieferbar',
    statusSrc: 'S41',
    arrival: { kind: 'rotor', id: 'M6' },
    at: [8.4, -4.4],
    yawDeg: -90,
    plinth: 'turntable-small',
    rows: {
      size: null,
      weight: v('ca. 18,3 kg', 'about 18.3 kg', HA, 'S41'),
      dof: v('7 Gelenke, Drehmomentsensor in jedem', '7 joints, a torque sensor in each', HA, 'S41'),
      payload: v('3 kg', '3 kg', HA, 'S41', bi('Nennlast laut Datenblatt', 'rated, per datasheet')),
      reach: v('855 mm', '855 mm', HA, 'S41'),
      speed: v('TCP bis 2 m/s · < ± 0,1 mm', 'TCP up to 2 m/s · < ± 0.1 mm', HA, 'S41'),
      runtime: null,
      env: v('IP40 · Regelung mit 1 kHz', 'IP40 · control at 1 kHz', HA, 'S41'),
    },
    can: v('Drehmomentsensor in jedem der 7 Gelenke, Steuerung mit 1 kHz.', 'A torque sensor in each of its 7 joints, 1 kHz control.', HA, 'S41'),
    limits: v('3 kg Nutzlast; IP40, also nur trocken und sauber.', '3 kg payload; IP40, so dry and clean places only.', HA, 'S41'),
    facts: { moves: 'fest', lifts: true, arm: true, payloadKg: 3, reachMm: 855, ip: 4, torqueAll: true },
  },
  {
    id: 'kuka-iiwa-14',
    short: 'LBR iiwa 14',
    cat: 'greifen',
    kind: bi('Sensitiver Cobot', 'Sensitive cobot'),
    status: 'lieferbar',
    statusSrc: 'S42',
    arrival: { kind: 'bestand' },
    amber: true,
    at: [12.0, -4.4],
    yawDeg: -90,
    plinth: 'turntable-small',
    rows: {
      size: null,
      weight: v('29,9 kg', '29.9 kg', QU, 'S43'),
      dof: v('7 Achsen, Drehmomentsensoren in allen', '7 axes, torque sensors in all', HA, 'S42'),
      payload: v('14 kg', '14 kg', HA, 'S42', bi('Nennlast laut Hersteller', 'rated, per vendor')),
      reach: v('820 mm', '820 mm', HA, 'S42'),
      speed: null,
      runtime: null,
      env: v('IP54 · Momentsensoren ± 2 % des Maximalmoments', 'IP54 · torque sensors ± 2 % of max torque', HA, 'S42'),
    },
    can: v('Spürt Berührung in allen 7 Achsen; 14 kg Nutzlast.', 'Feels contact in all 7 axes; 14 kg payload.', HA, 'S42'),
    limits: v('Reichweite 820 mm.', '820 mm of reach.', HA, 'S42'),
    facts: { moves: 'fest', lifts: true, arm: true, payloadKg: 14, reachMm: 820, ip: 5, torqueAll: true },
  },
  {
    id: 'shadow-hand',
    short: 'Shadow Hand',
    cat: 'greifen',
    kind: bi('Hand', 'Hand'),
    status: 'lieferbar',
    statusSrc: 'S56',
    arrival: { kind: 'rotor', id: 'M3' },
    at: [4.8, -0.6],
    yawDeg: -90,
    plinth: 'column',
    rows: {
      size: null,
      weight: v('4,3 kg', '4.3 kg', HA, 'S56'),
      dof: v('24 Gelenke, 20 angetrieben', '24 joints, 20 driven', HA, 'S56'),
      payload: null,
      reach: null,
      speed: null,
      runtime: null,
      env: v('über 100 Sensoren bis 1 kHz · 2 taktile Fingerspitzen (bis 5)', 'over 100 sensors at up to 1 kHz · 2 tactile fingertips (up to 5)', HA, 'S56'),
    },
    can: v('20 angetriebene Gelenke, über 100 Sensoren bis 1 kHz.', '20 driven joints, over 100 sensors at up to 1 kHz.', HA, 'S56'),
    limits: v('4,3 kg; Preis nur auf Anfrage.', '4.3 kg; price on request only.', HA, 'S56'),
    facts: { moves: 'fest', lifts: true },
  },
  {
    id: 'robotiq-2f85',
    short: '2F-85',
    cat: 'greifen',
    kind: bi('Greifer', 'Gripper'),
    status: 'lieferbar',
    statusSrc: 'S58',
    arrival: { kind: 'bestand' },
    amber: true,
    at: [8.4, -0.6],
    yawDeg: -90,
    plinth: 'column',
    rows: {
      size: v('Hub 85 mm', '85 mm stroke', HA, 'S57'),
      weight: v('0,9 kg', '0.9 kg', HA, 'S57'),
      dof: v('1 Antrieb', '1 actuator', HA, 'S57'),
      payload: v('5 kg', '5 kg', HA, 'S57', bi('Höchstwert laut Produktblatt', 'maximum, per product sheet')),
      reach: null,
      speed: null,
      runtime: null,
      env: v('Griffkraft 20–235 N', 'grip force 20–235 N', HA, 'S57'),
    },
    can: v('Zwei Finger, 85 mm Hub, 20–235 N Griffkraft.', 'Two fingers, 85 mm stroke, 20–235 N of grip force.', HA, 'S57'),
    limits: v('Höchstens 5 kg.', '5 kg at most.', HA, 'S57'),
    facts: { moves: 'fest', lifts: true, payloadKg: 5 },
  },
  {
    id: 'stretch-3',
    short: 'Stretch 3',
    cat: 'greifen',
    kind: bi('Mobiler Manipulator', 'Mobile manipulator'),
    status: 'lieferbar',
    statusSrc: 'S51',
    arrival: { kind: 'bestand' },
    at: [12.2, -0.6],
    yawDeg: -90,
    plinth: 'turntable',
    rows: {
      size: v('33 × 34 × 141 cm (unbestätigt)', '33 × 34 × 141 cm (unverified)', QU, 'S52'),
      weight: v('24,5 kg', '24.5 kg', QU, 'S51'),
      dof: v('Hubsäule, Teleskoparm, Handgelenk', 'lift column, telescopic arm, wrist', MO),
      payload: v('2 kg (unbestätigt)', '2 kg (unverified)', QU, 'S52'),
      reach: null,
      speed: null,
      runtime: v('2–5 h (unbestätigt)', '2–5 h (unverified)', QU, 'S52'),
      env: null,
    },
    can: v('Mobiler Arm mit Hubsäule und Teleskoparm; nur 24,5 kg leicht.', 'A mobile arm with a lift column and a telescopic arm; weighs only 24.5 kg.', QU, 'S51'),
    limits: v('2 kg Nutzlast (unbestätigt).', '2 kg payload (unverified).', QU, 'S52'),
    facts: { moves: 'faehrt', lifts: true, payloadKg: 2 },
  },
  {
    id: 'fanuc-r2000ic-165f',
    short: 'R-2000iC/165F',
    cat: 'greifen',
    kind: bi('Industriearm', 'Industrial arm'),
    status: 'lieferbar',
    statusSrc: 'S44',
    arrival: { kind: 'rotor', id: 'M5' },
    at: [6.2, 3.8],
    // the arm reaches forward (+z of the model): toward the entrance, over its own plinth
    yawDeg: 0,
    plinth: 'fixed',
    rows: {
      size: v('Nullstellung 2,48 × 0,75 × 2,11 m', 'zero pose 2.48 × 0.75 × 2.11 m', MO),
      weight: v('1090 kg', '1090 kg', HA, 'S44'),
      dof: v('6 Achsen', '6 axes', HA, 'S44'),
      payload: v('165 kg', '165 kg', HA, 'S44', bi('Nennlast laut Hersteller', 'rated, per vendor')),
      reach: v('2655 mm', '2655 mm', HA, 'S44'),
      speed: v('± 0,05 mm Wiederholgenauigkeit', '± 0.05 mm repeatability', HA, 'S44'),
      runtime: null,
      env: null,
    },
    can: v('Schweißt und hebt im Autobau: 165 kg, 2655 mm Reichweite.', 'Welds and lifts in car plants: 165 kg, 2655 mm of reach.', HA, 'S44'),
    limits: v('Wiegt selbst 1090 kg.', 'Weighs 1090 kg itself.', HA, 'S44'),
    facts: { moves: 'fest', lifts: true, arm: true, payloadKg: 165, reachMm: 2655 },
    loadPoint: true,
  },
  {
    id: 'pal-tiago',
    short: 'TIAGo',
    cat: 'greifen',
    kind: bi('Mobiler Manipulator', 'Mobile manipulator'),
    status: 'lieferbar',
    statusSrc: 'S50',
    arrival: { kind: 'bestand' },
    at: [12.2, 3.4],
    yawDeg: -90,
    plinth: 'turntable',
    rows: {
      size: v('1,10–1,45 m hoch · Basis ø 54 cm', '1.10–1.45 m tall · base ø 54 cm', HA, 'S50'),
      weight: null,
      dof: v('Arm mit 7 Gelenken', '7-joint arm', HA, 'S50'),
      payload: v('3 kg', '3 kg', HA, 'S50', bi('ohne Greifer', 'without gripper')),
      reach: null,
      speed: null,
      runtime: v('4–5 h (1 Akku) · 8–10 h (2)', '4–5 h (1 battery) · 8–10 h (2)', HA, 'S50'),
      env: null,
    },
    can: v('Fährt, ist 110 bis 145 cm hoch, Arm mit 7 Gelenken.', 'Drives, stands 110 to 145 cm tall, 7-joint arm.', HA, 'S50'),
    limits: v('3 kg Armlast ohne Greifer; 4–5 h pro Akku.', '3 kg arm load without a gripper; 4–5 h per battery.', HA, 'S50'),
    facts: { moves: 'faehrt', lifts: true, payloadKg: 3 },
  },
  {
    id: 'mir250',
    short: 'MiR250',
    cat: 'greifen',
    kind: bi('Fahrroboter (AMR)', 'Mobile robot (AMR)'),
    status: 'lieferbar',
    statusSrc: 'S47',
    arrival: { kind: 'bestand' },
    amber: true,
    at: [12.2, 7.4],
    yawDeg: -90,
    plinth: 'turntable',
    rows: {
      size: v('80 × 58 cm · 30 cm hoch', '80 × 58 cm · 30 cm tall', HA, 'S47'),
      weight: v('94–97 kg (je nach Blatt)', '94–97 kg (varies by sheet)', QU, 'S48'),
      dof: v('2 Antriebsräder', '2 drive wheels', MO),
      payload: v('250 kg', '250 kg', HA, 'S47', bi('auf Aufsatzmodulen (Haken, Träger, Lift)', 'on top modules (hook, carrier, lift)')),
      reach: null,
      speed: v('2 m/s', '2 m/s', HA, 'S47'),
      runtime: v('„bis zu 20 Stunden am Tag“', '"up to 20 hours a day"', HA, 'S47'),
      env: v('Durchfahrten ab 80 cm', 'passages from 80 cm', HA, 'S47'),
    },
    can: v('Fährt bis 250 kg selbstständig durch Halle und Lager, 2 m/s.', 'Drives up to 250 kg through plants and warehouses on its own, at 2 m/s.', HA, 'S47'),
    limits: v('Nur 30 cm hoch: Lasten fahren auf Aufsatzmodulen (Haken, Träger, Lift).', 'Only 30 cm tall: loads ride on top modules (hook, carrier, lift).', HA, 'S47'),
    facts: { moves: 'faehrt', lifts: false, payloadKg: 250 },
  },
  // ── SELBST BAUEN ─────────────────────────────────────────────────────────────────────────
  {
    id: 'so101',
    short: 'SO-101',
    cat: 'bauen',
    kind: bi('Offener Arm', 'Open arm'),
    status: 'selbstbau',
    statusSrc: 'S22',
    arrival: { kind: 'rotor', id: 'M4' },
    at: [9.2, -8.2],
    yawDeg: 0,
    plinth: 'column',
    rows: {
      size: v('Nullstellung 0,43 m lang', 'zero pose 0.43 m long', MO),
      weight: null,
      dof: v('6 Servos (STS3215)', '6 servos (STS3215)', HA, 'S22'),
      payload: null,
      reach: null,
      speed: null,
      runtime: null,
      env: null,
    },
    can: v('Offener Arm zum Selberbauen, gemacht für LeRobot; Teile ca. 122 US$.', 'An open arm you build yourself, made for LeRobot; parts about US$122.', QU, 'S22'),
    limits: v('Hobby-Servos; Nutzlast und Reichweite nicht angegeben.', 'Hobby servos; no payload or reach stated.', HA, 'S22'),
    facts: { moves: 'fest', lifts: true, arm: true, open: true, lerobot: true },
    probefahrt: { area: 'lern-dojo', label: bi('Probefahrt im Lern-Dojo', 'Test drive in the Learning Dojo') },
  },
  {
    id: 'open-duck-mini-v2',
    short: 'Open Duck Mini',
    cat: 'bauen',
    kind: bi('Offener Zweibeiner', 'Open biped'),
    status: 'selbstbau',
    statusSrc: 'S21',
    arrival: { kind: 'rotor', id: 'M2' },
    at: [11.1, -7.6],
    yawDeg: 0,
    plinth: 'low',
    rows: {
      size: v('ca. 42 cm (Beine gestreckt)', 'about 42 cm (legs extended)', HA, 'S21'),
      weight: v('2,06 kg', '2.06 kg', MO),
      dof: v('16 Gelenke', '16 joints', MO),
      payload: null,
      reach: null,
      speed: null,
      runtime: null,
      env: null,
    },
    can: v('Offener Zweibeiner, ca. 42 cm, lernt Laufen per Reinforcement Learning.', 'An open biped, about 42 cm, that learns to walk by reinforcement learning.', HA, 'S21'),
    limits: v('Selbstbau unter 400 US$ Teilekosten; Projekt noch in Arbeit.', 'DIY build, under US$400 in parts; still a work in progress.', QU, 'S21'),
    facts: { moves: 'laeuft', lifts: false, open: true },
    probefahrt: { area: 'regelgarten', label: bi('Probefahrt im Regelgarten', 'Test drive in the Control Garden') },
  },
  {
    id: 'lekiwi-base',
    short: 'LeKiwi',
    cat: 'bauen',
    kind: bi('Offene Fahrbasis', 'Open mobile base'),
    status: 'selbstbau',
    statusSrc: 'LK',
    arrival: { kind: 'bestand' },
    at: [13.1, -7.0],
    yawDeg: -30,
    plinth: 'turntable-small',
    rows: {
      size: v('Basis 0,12 m hoch, ohne Arm', 'base 0.12 m tall, without the arm', MO),
      weight: null,
      dof: v('3 Allseitenräder', '3 omni wheels', MO),
      payload: null,
      reach: null,
      speed: null,
      runtime: null,
      env: null,
    },
    can: v('Offene, günstige Fahrbasis mit Allseitenrädern; oben fährt ein SO-101-Arm mit.', 'An open, low-cost base on omni wheels; an SO-101 arm rides on top.', HA, 'LK'),
    limits: v('Nutzlast und Laufzeit sind nicht angegeben.', 'No payload or runtime is stated.', HA, 'LK'),
    facts: { moves: 'faehrt', lifts: true, open: true },
  },
  // ── the Tresor ───────────────────────────────────────────────────────────────────────────
  {
    id: 'unitree-h2',
    short: 'H2',
    cat: 'gehen',
    kind: bi('Humanoid', 'Humanoid'),
    status: 'angekuendigt',
    statusSrc: 'S62',
    arrival: { kind: 'h2' },
    at: [-3.6, -11.0],
    yawDeg: 0,
    plinth: 'turntable',
    rows: {
      size: v('1,82 m', '1.82 m', HA, 'S31'),
      weight: v('ca. 70 kg', 'about 70 kg', HA, 'S31'),
      dof: v('31 Gelenke, 7 pro Arm', '31 joints, 7 per arm', HA, 'S31'),
      payload: v('ca. 7 kg pro Arm', '≈ 7 kg per arm', HA, 'S31', bi('Nennlast; Spitze ca. 15 kg', 'rated; peak ≈ 15 kg')),
      reach: null,
      speed: null,
      runtime: v('ca. 3 h', 'about 3 h', HA, 'S31'),
      env: null,
    },
    can: v('31 Gelenke, Arme mit 7 Gelenken, ca. 7 kg Nennlast pro Arm.', '31 joints, 7-joint arms, about 7 kg rated load per arm.', HA, 'S31'),
    limits: v('15 kg nur als Spitze; manche Funktionen sind laut Hersteller „noch in Entwicklung“.', '15 kg is peak only; per the vendor, some functions are "still being developed".', HA, 'S31'),
    facts: { moves: 'laeuft', lifts: true, humanoid: true, perArmKg: 7 },
    probefahrt: TRAUM,
  },
];

/** The robots in this build's hall: the amber exhibits only with VITE_AMBER=1 (src/core/release.ts). */
export const HALL_ROBOTS: readonly HallRobot[] = SHOW_AMBER ? ALL_HALL_ROBOTS : ALL_HALL_ROBOTS.filter((r) => !r.amber);

export const ROBOT_BY_ID: ReadonlyMap<RobotId, HallRobot> = new Map(HALL_ROBOTS.map((r) => [r.id, r]));

/** Plinth geometry per kind (plan §4.9: Ø 2.4 m humanoids and quadrupeds, Ø 1.6 m arms, 0.9 m columns, the FANUC fixed Ø 3.5 m). */
export const PLINTH: Record<PlinthKind, { r: number; h: number; spin: boolean; standAt: number }> = {
  turntable: { r: 1.2, h: 0.16, spin: true, standAt: 1.75 },
  'turntable-small': { r: 0.8, h: 0.16, spin: true, standAt: 1.3 },
  // hands and grippers at waist height: the column top is the stage
  column: { r: 0.32, h: 0.9, spin: true, standAt: 0.85 },
  fixed: { r: 1.75, h: 0.3, spin: false, standAt: 2.2 },
  low: { r: 0.6, h: 0.38, spin: true, standAt: 1.05 },
};

/** The order ←/→ steps through in Inspektion (by category, then as listed). */
export const INSPECT_ORDER: readonly RobotId[] = [...HALL_ROBOTS.filter((r) => r.cat === 'gehen'), ...HALL_ROBOTS.filter((r) => r.cat === 'greifen'), ...HALL_ROBOTS.filter((r) => r.cat === 'bauen')].map((r) => r.id);
