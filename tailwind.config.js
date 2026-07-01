/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#05060f',
          800: '#0a0c1b',
          700: '#10132a',
          600: '#171b3a',
        },
        glass: 'rgba(255,255,255,0.06)',
        basketball: '#ff7a18',
        tennis: '#22e07a',
        coach: '#7b6bff',
        neon: '#3ad7ff',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
