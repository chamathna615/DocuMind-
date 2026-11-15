/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#102A56',
        primary: { DEFAULT: '#7457C8', soft: '#F1ECFF' },
        accent: '#2563EB',
        ink: '#172033',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      boxShadow: { soft: '0 12px 34px rgba(15, 23, 42, 0.07)' },
    },
  },
  plugins: [],
}
