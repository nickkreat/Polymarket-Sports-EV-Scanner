/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0a0b',
          secondary: '#111113',
          card: '#18181b',
          hover: '#1e1e21',
          border: '#27272a',
        },
      },
    },
  },
  plugins: [],
}

