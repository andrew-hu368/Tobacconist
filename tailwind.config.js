const defaultTheme = require("tailwindcss/defaultTheme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.ejs", "./src/**/*.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", ...defaultTheme.fontFamily.sans],
      },
      backgroundImage: {
        conic: "conic-gradient(#fff 0deg, transparent 70deg)",
        radial:
          "radial-gradient(ellipse 80% 50%,rgba(120, 119, 198, 0.3),transparent)",
      },
      colors: {
        "brand-bg": "var(--brand-bg)",
        "brand-text": "var(--brand-text)",
        primary: "var(--bg-primary)",
        "table-header": "var(--table-header)",
        "table-row": "var(--table-row)",
      },
      container: {
        center: true,
        padding: "2rem",
        screens: {
          "2xl": "1376px",
        },
      },
      animation: {
        "spin-slow": "spin 5s linear infinite",
      },
    },
  },
  plugins: [],
};
