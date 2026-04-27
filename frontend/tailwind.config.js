/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // SafeSite AI dark navy color palette (matches the UI designs)
        navy: {
          900: '#0d1117',
          800: '#161b22',
          700: '#1f2937',
          600: '#252d3d',
          500: '#2d3748',
        },
        brand: {
          blue: '#3b82f6',
          green: '#22c55e',
          red: '#ef4444',
          orange: '#f97316',
          yellow: '#eab308',
          purple: '#a855f7',
        }
      }
    },
  },
  plugins: [],
}