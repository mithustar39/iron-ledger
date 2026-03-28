/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        glow: "0 0 0 1px rgba(148, 163, 184, 0.12), 0 24px 80px rgba(15, 23, 42, 0.45)",
      },
      colors: {
        ink: "#020617",
        steel: "#94a3b8",
        ember: "#f97316",
        limeflash: "#84cc16",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "ui-sans-serif", "system-ui"],
        body: ["'Manrope'", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
