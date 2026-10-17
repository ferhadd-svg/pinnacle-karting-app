/** Design tokens. Series colours are the validated dark-surface categorical steps (slots 1 and 2). */
export const colors = {
  bg: '#0d1020',
  surface: '#171b31',
  surface2: '#21263f',
  border: '#2c3252',
  text: '#f2f4fb',
  muted: '#8f97b3',
  /** Brand accent (salamander orange). Text on it uses accentText; white text on it is too low-contrast. */
  accent: '#F25C1F',
  accentText: '#1c0800',
  /** Lighter orange for icons, outlines and track lines on dark surfaces. */
  accentSoft: '#FF8A50',
  /** Row tint for "you" on leaderboards. */
  mine: 'rgba(242,92,31,0.16)',
  amber: '#ffcc00',
  /** Confirmations and the live dot stay green so they read as status, not brand. */
  success: '#3ee07f',
  purple: '#a77bff',
  danger: '#ff6b62',
  gold: '#f5c242',
  silver: '#c3c9d6',
  bronze: '#d08a4a',
  series1: '#3987e5',
  series2: '#d95926',
};

/** Thin type: big numbers and titles use `thin`, body text `light`, small labels `regular` so they stay legible. */
export const weight = { thin: '200', light: '300', regular: '400', medium: '500' } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { md: 14, lg: 20, pill: 999 };
export const mono = { fontVariant: ['tabular-nums' as const] };
