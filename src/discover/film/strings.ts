/**
 * The film's and the share card's UI chrome (WP-D3): buttons and titles, both languages, „du“. No claims:
 * the texts that say something are copies of the game's own strings (marked; tools/discover/share.mjs
 * compares them with src/i18n/core.ts). Plain `{ de, en }` texts, so the stills path resolves them too.
 */
export const F = {
  /** core.start.replay */
  film: { de: 'Abheben ansehen', en: 'Watch the lift-off' },
  skip: { de: 'Überspringen', en: 'Skip' },
  again: { de: 'Nochmal ansehen', en: 'Watch again' },
  backToTour: { de: 'Zurück zur Tour', en: 'Back to the tour' },
  share: { de: 'Link teilen', en: 'Share the link' },
  link: { de: 'Link', en: 'Link' },
  /** „EmAI Academy“ (index.html's title) · core.brand.game */
  shareTitle: { de: 'EmAI Academy · Schwebewerk', en: 'EmAI Academy · The Floating Works' },
  /** core.start.subtitle */
  subtitle: {
    de: 'Eine Insel, die fliegen soll – noch steht sie im Dock. Probier aus, wie Roboter sehen, regeln, greifen und lernen, miss, was Physical AI heute kann, und bring sie in die Luft.',
    en: 'An island built to fly, still standing in its dock. Try how robots see, control, grasp and learn, measure what Physical AI can do today, and get it into the air.',
  },
} as const;
