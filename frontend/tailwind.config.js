/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "node_modules/flowbite-react/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        purple: {
          50: '#FDF4FF',
          100: '#FAE5FF',
          200: '#F5CFFF',
          300: '#EDA4FF',
          400: '#E06BFF',
          500: '#8C00AA',
          600: '#700088',
          700: '#540066',
          800: '#380044',
          900: '#1C0022',
        },
      },
    },
  },
  plugins: [
    require('flowbite/plugin')
  ],
}
