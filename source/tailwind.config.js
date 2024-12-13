/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  prefix: "",
  theme: {
    extend: {
      keyframes: {
        "slide-in-top": {
          '0%': {
            transform: 'translateX(-50%) translateY(-100%)',
            opacity: '0'
          },
          '100%': {
            transform: 'translateX(-50%) translateY(0)',
            opacity: '1'
          },
        },
        "slide-out-top": {
          '0%': {
            transform: 'translateX(-50%) translateY(0)',
            opacity: '1'
          },
          '100%': {
            transform: 'translateX(-50%) translateY(-100%)',
            opacity: '0'
          },
        },
      },
      animation: {
        "slide-in-from-top": "slide-in-top 0.3s ease-out",
        "slide-out-to-top": "slide-out-top 0.3s ease-in",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
