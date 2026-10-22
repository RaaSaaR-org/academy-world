/**
 * Discover's UI chrome (WP-D0): buttons, labels, step and state lines. No content and no claims here:
 * card texts are copied from the game's strings (tour/content.gen.ts, D1; robots.gen.ts, D2). Where the
 * game already has the word it is the same word (core.pause.reducedMotion, core.start.credits, …).
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
  /** the game's own line (core.start.touch, the index.html notice): why „Am Laptop spielen“ */
  laptopNote: {
    de: 'Das Schwebewerk braucht Maus und Tastatur. Öffne den Link am besten am Laptop oder Desktop.',
    en: 'The Floating Works needs a mouse and keyboard. Open the link on a laptop or desktop.',
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
