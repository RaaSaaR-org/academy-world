/**
 * The viewer's UI chrome (WP-D2): buttons and labels only, both languages, „du“. No content and no
 * claims: the robot texts are copied from the hall (src/discover/data/robots.gen.ts). Where Discover
 * already has the words, they are the same words („Zurück zur Tour“ is the film's end card, plan §5 WP-D3).
 */
export const V = {
  /** a robot card's action (tour hotspots): open this robot in the studio */
  view3d: { de: 'In 3D ansehen', en: 'View in 3D' },
  back: { de: 'Zurück zur Tour', en: 'Back to the tour' },
  /** framing: the robot with the „Du“ and EMI figures and the scale, or the robot alone */
  nextToYou: { de: 'Neben dir', en: 'Next to you' },
  close: { de: 'Nah', en: 'Close up' },
  framing: { de: 'Ansicht', en: 'View' },
  categories: { de: 'Kategorien', en: 'Categories' },
  robots: { de: 'Roboter', en: 'Robots' },
} as const;
