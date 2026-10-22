/**
 * „Wo Automatisierung sich lohnt“ (plan §2.8, D43; R8 §5 „Entscheider takeaways“): one Befundkarte in
 * the Entscheider's PNG set, with a row for each site the player visited and the rule for everyone.
 * The rows and their sources are R8's (docs/research/R8-WORLD-USECASES.md §5 and §8: S2, S3, S7, S17,
 * S18, S19, S25, S26, S32, S36–S38); a row with numbers carries its chip.
 */
export interface PayoffRow {
  /** the area whose visit shows the row (null: always) */
  area: string | null;
  title: { de: string; en: string };
  pays: { de: string; en: string };
  notYet: { de: string; en: string };
  source: { de: string; en: string };
  chip: 'studie' | 'quelle' | null;
}

export const PAYOFF_TEXT = {
  eyebrow: { de: '// BEFUNDKARTE · ENTSCHEIDER', en: '// FINDINGS CARD · DECISION MAKERS' },
  title: { de: 'Wo Automatisierung sich lohnt', en: 'Where automation pays' },
  pays: { de: 'Lohnt sich, wenn', en: 'Pays when' },
  notYet: { de: 'Noch nicht, wenn', en: 'Not yet when' },
  none: { de: 'Besuch die Orte im Revier: Ihre Zeilen erscheinen hier.', en: 'Visit the sites in the Revier: their rows appear here.' },
  foot: { de: 'Quellen: R8 · Fraunhofer ISE, Wageningen, FAO und Herstellerangaben (Stand Oktober 2026).', en: 'Sources: R8 · Fraunhofer ISE, Wageningen, FAO and vendor data (as of October 2026).' },
};

export const PAYOFF: PayoffRow[] = [
  {
    area: 'sonnenacker',
    title: { de: 'Agri-PV über Kulturen', en: 'Agrivoltaics over crops' },
    pays: { de: 'eigener Stromverbrauch, Schutz vor Hagel, Hitze und Dürre, schattenverträgliche Kulturen', en: 'own use of the power, protection from hail, heat and drought, shade-tolerant crops' },
    notYet: { de: 'lichthungrige Kulturen als Haupteinkommen; Vergütung unklar', en: 'light-hungry crops as the main income; tariffs unclear' },
    source: { de: 'Fraunhofer ISE 2024; §35 BauGB', en: 'Fraunhofer ISE 2024; §35 BauGB' },
    chip: null,
  },
  {
    area: 'sonnenacker',
    title: { de: 'Ernteroboter', en: 'Fruit-picking robots' },
    pays: { de: 'ca. 6 s Takt, mindestens 95 % Erfolg, rund 20 h am Tag, Kultur und Gewächshaus für Roboter geplant', en: 'a cycle of about 6 s, at least 95 % success, about 20 h a day, crop and greenhouse planned for robots' },
    notYet: { de: 'Mittelwerte der Forschung (33 s, 66 %)', en: 'research averages (33 s, 66 %)' },
    source: { de: 'Bac et al. 2014; Bac 2015 (Wageningen)', en: 'Bac et al. 2014; Bac 2015 (Wageningen)' },
    chip: 'studie',
  },
  {
    area: 'lern-dojo',
    title: { de: 'Günstige Arme (SO-101)', en: 'Low-cost arms (SO-101)' },
    pays: { de: 'Lehre, Prototypen, Datensammeln, Demonstratoren', en: 'teaching, prototyping, data collection, demonstrators' },
    notYet: { de: 'Produktion, schwere Lasten, große Reichweite', en: 'production, heavy loads, long reach' },
    source: { de: 'TheRobotStudio SO-ARM100; R1', en: 'TheRobotStudio SO-ARM100; R1' },
    chip: null,
  },
  {
    area: 'kreislaufhof',
    title: { de: 'Sortierroboter', en: 'Sorting robots' },
    pays: { de: 'Bänder, die rund um die Uhr laufen, mit bekannten Stoffströmen', en: 'belts that run around the clock with known material streams' },
    notYet: { de: 'kleine Mengen, unbekannte Mischungen', en: 'low volumes, unknown mixes' },
    source: { de: 'AMP Robotics 2021 (Herstellerangabe)', en: 'AMP Robotics 2021 (vendor data)' },
    chip: null,
  },
  {
    area: 'unkrautacker',
    title: { de: 'Präzisionsjäten', en: 'Precision weeding' },
    pays: { de: 'hochwertiges Gemüse, Bio-Betriebe, strengere Grenzen für Herbizide', en: 'high-value vegetables, organic farms, tighter herbicide limits' },
    notYet: { de: 'große Ackerflächen, auf denen Fläche pro Stunde zählt', en: 'large arable fields where area per hour rules' },
    source: { de: 'FAO Agritech Observatory; Ecorobotix 2026; Carbon Robotics 2022', en: 'FAO Agritech Observatory; Ecorobotix 2026; Carbon Robotics 2022' },
    chip: null,
  },
  {
    area: null,
    title: { de: 'Regel für alle', en: 'Rule for all' },
    pays: { de: 'Vergleiche die gemessene Quote unter deinen Bedingungen mit der Stelle, die leer bleibt – über mehrere Jahre.', en: 'Compare the measured rate under your conditions with the post that stays empty, over several years.' },
    notYet: { de: 'eine Vorführung unter Bestbedingungen', en: 'a demo under best-fit conditions' },
    source: { de: 'Arad et al. 2020 (SWEEPER)', en: 'Arad et al. 2020 (SWEEPER)' },
    chip: null,
  },
];

export const PAYOFF_CHIP = { studie: { de: 'STUDIE', en: 'STUDY' }, quelle: { de: 'QUELLE', en: 'SOURCE' } } as const;
