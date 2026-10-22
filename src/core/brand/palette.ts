/**
 * EmAI brand tokens (source: the EmAI brand kit, styleguide.md + brand.css).
 * Orange is the hero colour — use it SPARINGLY (≈5 % of the screen: interactables,
 * active markers, current objective, hazard tape, key metrics). Neutrals are warm stone.
 */
export const palette = {
  orange: 0xff6700, // Caltrans Orange
  orangeDark: 0xcc5200,
  orangeLight: 0xff8534,
  orangeLighter: 0xffa366,
  teal: 0x2dd4bf, // secondary: sensor rays, data flows, waypoints, 2nd-tier interactables
  base: 0x141414, // logo disc must be exactly this
  surface: 0x1f1f1f,
  elevated: 0x292929,
  border: 0x3d3d3d,
  borderSubtle: 0x2a2a2a,
  text: 0xf5f5f4,
  textSecondary: 0xa8a29e,
  textMuted: 0x78716c,
  success: 0x4ade80,
  error: 0xf87171,
  warning: 0xfbbf24,
  hazardBlack: 0x0a0a0a,
  stone: {
    50: 0xfafaf9,
    100: 0xf5f5f4,
    200: 0xe7e5e4,
    300: 0xd6d3d1,
    400: 0xa8a29e,
    500: 0x78716c,
    600: 0x57534e,
    700: 0x44403c,
    800: 0x292524,
    900: 0x1c1917,
    950: 0x0c0a09,
  },
} as const;

/** Same tokens as CSS strings (for canvas drawing / DOM). */
export const css = {
  orange: '#FF6700',
  orangeDark: '#CC5200',
  orangeLight: '#FF8534',
  orangeLighter: '#FFA366',
  orangeBg: 'rgba(255,103,0,0.08)',
  teal: '#2DD4BF',
  tealMuted: 'rgba(45,212,191,0.15)',
  base: '#141414',
  surface: '#1F1F1F',
  elevated: '#292929',
  border: '#3D3D3D',
  borderSubtle: '#2A2A2A',
  text: '#F5F5F4',
  textSecondary: '#A8A29E',
  textMuted: '#78716C',
  success: '#4ADE80',
  error: '#F87171',
  warning: '#FBBF24',
  hazardBlack: '#0A0A0A',
  fontDisplay: "'Space Grotesk', sans-serif",
  fontSans: "'Geist', sans-serif",
  fontMono: "'Geist Mono', ui-monospace, monospace",
} as const;

export type Palette = typeof palette;
