import { SportType } from '@/models';

// ---------------------------------------------------------------------------
// Theming — CourtHub ships a dark (default) and a light palette.
//
// Every screen reads colors *inline at render time* from the live `COLORS`
// object (and `APP_GRADIENT` array). `applyThemePalette()` swaps the active
// theme by mutating those same object/array references in place, so once the
// mounted screens re-render they pick up the new values. See `useAppStore`'s
// `theme`/`setTheme` (which calls this) and `useThemeName()` for the re-render
// subscription used by the mounted screens/layouts.
// ---------------------------------------------------------------------------

export type ThemeName = 'dark' | 'light';

export interface Palette {
  bg900: string;
  bg800: string;
  bg700: string;
  bg600: string;

  card: string;
  cardBorder: string;
  cardStrong: string;
  /** Faint solid surface — icon tiles, inputs, progress-bar tracks. */
  chip: string;
  /** Faint gradient edge stop used inside glass/card gradients. */
  glassEdge: string;

  text: string;
  textMuted: string;
  textFaint: string;

  basketball: string;
  basketballSoft: string;
  tennis: string;
  tennisSoft: string;
  coach: string;
  coachSoft: string;
  neon: string;

  success: string;
  danger: string;
  warning: string;

  // Chrome
  navBg: string; // Stack contentStyle background (behind screens)
  tabBar: string; // bottom tab bar background
  statusBar: 'light' | 'dark'; // status bar content style
  /** App-wide background gradient (top → bottom). */
  gradient: [string, string, string];
}

// Dark — the original, futuristic sports-tech palette.
const DARK: Palette = {
  bg900: '#05060f',
  bg800: '#0a0c1b',
  bg700: '#10132a',
  bg600: '#171b3a',

  card: 'rgba(255,255,255,0.06)',
  cardBorder: 'rgba(255,255,255,0.10)',
  cardStrong: 'rgba(255,255,255,0.12)',
  chip: 'rgba(255,255,255,0.05)',
  glassEdge: 'rgba(255,255,255,0.04)',

  text: '#f5f7ff',
  textMuted: '#9aa3c7',
  textFaint: '#5d6488',

  basketball: '#ff7a18',
  basketballSoft: 'rgba(255,122,24,0.16)',
  tennis: '#22e07a',
  tennisSoft: 'rgba(34,224,122,0.16)',
  coach: '#7b6bff',
  coachSoft: 'rgba(123,107,255,0.16)',
  neon: '#3ad7ff',

  success: '#22e07a',
  danger: '#ff5468',
  warning: '#ffce4f',

  navBg: '#05060f',
  tabBar: 'rgba(8,10,22,0.92)',
  statusBar: 'light',
  gradient: ['#05060f', '#0a0c1b', '#10132a'],
};

// Light — clean, airy counterpart. Accents are deepened where the neon-bright
// dark values would wash out on near-white surfaces.
const LIGHT: Palette = {
  bg900: '#eef1fb',
  bg800: '#f5f7fd',
  bg700: '#ffffff',
  bg600: '#ffffff',

  card: 'rgba(17,20,45,0.05)',
  cardBorder: 'rgba(17,20,45,0.12)',
  cardStrong: 'rgba(17,20,45,0.09)',
  chip: 'rgba(17,20,45,0.06)',
  glassEdge: 'rgba(17,20,45,0.04)',

  text: '#12163a',
  textMuted: '#565d82',
  textFaint: '#98a0c0',

  basketball: '#ef6a10',
  basketballSoft: 'rgba(239,106,16,0.14)',
  tennis: '#12b866',
  tennisSoft: 'rgba(18,184,102,0.14)',
  coach: '#6a5aff',
  coachSoft: 'rgba(106,90,255,0.14)',
  neon: '#0aa5c9',

  success: '#12b866',
  danger: '#f0384f',
  warning: '#d99a00',

  navBg: '#eef1fb',
  tabBar: 'rgba(255,255,255,0.94)',
  statusBar: 'dark',
  gradient: ['#ffffff', '#f5f7fd', '#eef1fb'],
};

export const PALETTES: Record<ThemeName, Palette> = { dark: DARK, light: LIGHT };

// Live, mutable palette. Seeded with dark; `applyThemePalette` swaps values in
// place so existing `COLORS.x` reads keep working without re-importing.
export const COLORS: Palette = { ...DARK };

// Same array reference throughout the app; mutated in place on theme change.
export const APP_GRADIENT: [string, string, string] = [...DARK.gradient];

/** Swap the active theme by mutating the live COLORS / APP_GRADIENT in place. */
export function applyThemePalette(name: ThemeName): void {
  const p = PALETTES[name];
  Object.assign(COLORS, p);
  APP_GRADIENT[0] = p.gradient[0];
  APP_GRADIENT[1] = p.gradient[1];
  APP_GRADIENT[2] = p.gradient[2];
}

// Per-sport accent helpers (read the live palette).
export const sportAccent = (sport: SportType) =>
  sport === 'basketball' ? COLORS.basketball : COLORS.tennis;

export const sportAccentSoft = (sport: SportType) =>
  sport === 'basketball' ? COLORS.basketballSoft : COLORS.tennisSoft;

export const sportLabel = (sport: SportType) =>
  sport === 'basketball' ? 'Basketball' : 'Tennis';

export const sportMode = (sport: SportType) =>
  sport === 'basketball' ? 'Basketball Mode' : 'Tennis Mode';
