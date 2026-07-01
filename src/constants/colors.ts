import { SportType } from '@/models';

// Core palette — dark, futuristic sports-tech.
export const COLORS = {
  bg900: '#05060f',
  bg800: '#0a0c1b',
  bg700: '#10132a',
  bg600: '#171b3a',

  card: 'rgba(255,255,255,0.06)',
  cardBorder: 'rgba(255,255,255,0.10)',
  cardStrong: 'rgba(255,255,255,0.12)',

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
} as const;

// Per-sport accent helpers.
export const sportAccent = (sport: SportType) =>
  sport === 'basketball' ? COLORS.basketball : COLORS.tennis;

export const sportAccentSoft = (sport: SportType) =>
  sport === 'basketball' ? COLORS.basketballSoft : COLORS.tennisSoft;

export const sportLabel = (sport: SportType) =>
  sport === 'basketball' ? 'Basketball' : 'Tennis';

export const sportMode = (sport: SportType) =>
  sport === 'basketball' ? 'Basketball Mode' : 'Tennis Mode';

// Background gradient used app-wide.
export const APP_GRADIENT = ['#05060f', '#0a0c1b', '#10132a'] as const;
