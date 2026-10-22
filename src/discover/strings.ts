/**
 * Discover's UI chrome (WP-D0): buttons, labels, step and state lines. No content and no claims here:
 * card texts are copied from the game's strings (tour/content.gen.ts, D1; robots.gen.ts, D2). Where the
 * game already has the word it is the same word (core.pause.reducedMotion, core.start.credits, …).
 * One line is Discover's own wording: S.laptopNote restates core.start.touch as an info (where the full game is played).
 * Both languages, „du“. Plain `{ de, en }` texts, so the stills path resolves them without the game.
 */
export const S = {
  discover: { de: 'Entdecken', en: 'Discover' },
  go: { de: 'Los', en: 'Go' },
  menu: { de: 'Menü', en: 'Menu' },
  language: { de: 'Sprache', en: 'Language' },
  close: { de: 'Schließen', en: 'Close' },
  prev: { de: 'Zurück', en: 'Back' },
  next: { de: 'Weiter', en: 'Next' },
  expand: { de: 'Mehr anzeigen', en: 'Show more' },
  collapse: { de: 'Weniger anzeigen', en: 'Show less' },
  info: { de: 'Info', en: 'Info' },
  loading: { de: 'lädt …', en: 'loading …' },
  reducedMotion: { de: 'Reduzierte Bewegung', en: 'Reduced motion' },
  sound: { de: 'Ton', en: 'Sound' },
  playOnLaptop: { de: 'Am Laptop spielen', en: 'Play on a laptop' },
  credits: { de: 'Credits & Lizenzen', en: 'Credits & licences' },
  measure: { de: 'Messen', en: 'Measure' },
  copy: { de: 'Kopieren', en: 'Copy' },
  copied: { de: 'Kopiert', en: 'Copied' },
  linkCopied: { de: 'Link kopiert', en: 'Link copied' },
  hereToSee: { de: 'Hier zu sehen', en: 'You can see here' },
  /**
   * Where the full game is (founder decision 2026-10-23, D45): an info, not the game's refusal. The start
   * card, „Am Laptop spielen“, the film's end card and the share text. The game's own notice
   * (core.start.touch, index.html) stays as it is; tools/discover/share.mjs checks both.
   */
  laptopNote: {
    de: 'Das ganze Spiel spielst du am Laptop oder Desktop, mit Maus und Tastatur.',
    en: 'You can play the full game on a laptop or desktop with a mouse and keyboard.',
  },
  /** stills tour */
  stillsTour: { de: 'Bilder-Tour', en: 'Picture tour' },
  stillsOffer: { de: 'Ruckelt es? Zur Bilder-Tour', en: 'Choppy? Switch to the picture tour' },
  try3d: { de: '3D-Ansicht versuchen', en: 'Try the 3D view' },
  /** the readout */
  perfTitle: { de: 'Messung', en: 'Measurement' },
  crashSeen: { de: 'Letzte Sitzung neu geladen', en: 'Last session reloaded' },
  benchRunning: { de: 'Messung läuft …', en: 'Measuring …' },
  benchDone: { de: 'Messung fertig', en: 'Measurement done' },
  na: { de: 'n. v.', en: 'n/a' },
} as const;
