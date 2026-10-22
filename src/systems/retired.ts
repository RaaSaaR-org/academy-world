/**
 * Retired stations (plan §3.5 rule 3; mechanism WP1, src/systems/migrate.ts). The WP that retires a
 * station appends its stamp id to RETIRED in the same commit (WP5 'regelgarten.tausend-welten', WP8
 * 'greifwerkstatt.griffe'); the boot migration then moves its stamp, challenge record, prediction and
 * prefixed bests to `legacy`, so they no longer count for rotors, stars, Prognose-Güte or the tower.
 * The Pass names them in one archive line („rc4-Stempel: …“). Data only.
 */
export const RETIRED: readonly string[] = [
  'regelgarten.tausend-welten', // WP5: Regelgarten C became „Lauf, Ente!“ (plan §4.3)
  'greifwerkstatt.griffe', // WP8: Greifwerkstatt C became „Lastdiagramm“ (plan §4.4)
];

/** Pass titles of retired stations, whose stations have left their manifests (fallback: the id). */
export const RETIRED_TITLES: Readonly<Record<string, { de: string; en: string }>> = {
  'greifwerkstatt.griffe': { de: '200 Griffe', en: '200 grasps' },
  'regelgarten.tausend-welten': { de: 'Tausend falsche Welten', en: 'A thousand wrong worlds' },
};
