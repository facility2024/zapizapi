/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0A0A0A",
          secondary: "#111111",
          card: "#1A1A1A",
        },
        accent: {
          DEFAULT: "#8B00FF",
          light: "#A100FF",
          glow: "rgba(139, 0, 255, 0.15)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-sm": "0 0 10px rgba(139, 0, 255, 0.2)",
        glow: "0 0 20px rgba(139, 0, 255, 0.3)",
        "glow-lg": "0 0 40px rgba(139, 0, 255, 0.4)",
      },
    },
  },
  plugins: [],
};
