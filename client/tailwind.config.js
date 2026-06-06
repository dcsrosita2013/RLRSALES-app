/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // RLR brand palette — navy + silver to match the logo.
        navy: {
          DEFAULT: '#1e3a5f',
          dark: '#16284a',
          light: '#2c4f7c',
        },
        silver: {
          DEFAULT: '#9ca3af',
          light: '#cbd1d8',
          dark: '#6b7280',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
