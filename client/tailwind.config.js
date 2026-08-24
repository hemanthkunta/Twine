/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0e1621',
          800: '#17212b',
          700: '#242f3d',
          600: '#2b5278',
        }
      }
    },
  },
  plugins: [],
}
