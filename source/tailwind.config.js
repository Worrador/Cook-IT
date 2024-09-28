module.exports = {
    content: [
      "./src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
      extend: {
        colors: {
            primary: '#111725', // Darker shade for primary
            secondary: '#4B5563', // Darker shade for secondary
            // Define other colors as necessary
          },
      },
    },
    plugins: [require('@tailwindcss/forms')],
  }