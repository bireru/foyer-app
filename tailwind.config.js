/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette chaleureuse — un foyer, pas une salle des machines
        paper: '#FBF3EA',      // fond crème doux
        surface: '#FFFDFA',    // cartes
        ink: '#3A2E27',        // texte principal, brun chaud
        muted: '#8A7A6E',      // texte secondaire, taupe
        line: '#EDE0D2',       // séparateurs beiges
        blueprint: '#D9C7B0',  // contours pointillés (pièces "pas encore construites")
        billel: {
          DEFAULT: '#E0714B',
          light: '#F0A98C',
          bg: '#FCEAE2'
        },
        cerine: {
          DEFAULT: '#A8577A',
          light: '#D69AB8',
          bg: '#FBEAF1'
        },
        good: '#6B9071',
        sun: '#E8A93A'
      },
      fontFamily: {
        display: ['"Fredoka"', 'sans-serif'],
        body: ['"Nunito Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      },
      borderRadius: {
        card: '18px'
      },
      boxShadow: {
        soft: '0 4px 20px -6px rgba(58, 46, 39, 0.12)',
        softHover: '0 8px 28px -8px rgba(58, 46, 39, 0.18)'
      }
    }
  },
  plugins: []
}
