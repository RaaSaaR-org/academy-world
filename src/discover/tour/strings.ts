/**
 * The tour's UI chrome (WP-D1): buttons and labels only, no content (cards come from content.gen.ts,
 * copied from the game). Both languages, „du“. Plain { de, en } texts: the stills path resolves them
 * without the game. Where the game or D0 already has the word, that one is used instead (S.hereToSee,
 * S.prev, S.playOnLaptop).
 */
export const T = {
  /** the Schauhalle card's way into D2's viewer (the plan's wording, §3.2 stop 6) */
  viewRobots: { de: 'Roboter ansehen', en: 'View the robots' },
  /** the menu item and the heading of the stop list */
  allStops: { de: 'Alle Stopps', en: 'All stops' },
  /** a marker's label prefix for screen readers: „Info: Turm“ */
  info: { de: 'Info', en: 'Info' },
  /** the stills tour: the picture of a stop */
  picture: { de: 'Bild', en: 'Picture' },
} as const;
