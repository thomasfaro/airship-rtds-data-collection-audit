/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        airship: {
          navy: "#000818",
          "navy-soft": "#1F2A37",
          body: "#414651",
          muted: "#535862",
          "muted-light": "#717680",
          blue: "#056DFF",
          "blue-dark": "#0451BD",
          "blue-darker": "#030869",
          "blue-light": "#DCEAFF",
          "blue-mid": "#7ABFFF",
          seafoam: "#11DBC0",
          "seafoam-light": "#6DF0DE",
          chartreuse: "#E6F55A",
          "chartreuse-dark": "#D1E32B",
          success: "#04BF7B",
          danger: "#FF3976",
          "off-white": "#F7F8F8",
          border: "#E5E7EB",
          "border-strong": "#D5D7DA",
          surface: "#FFFFFF",
          "surface-muted": "#F5F5F5",
        },
      },
      fontFamily: {
        sans: ['"Instrument Sans Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono Variable"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        airship: "12px",
        "airship-lg": "16px",
        pill: "9999px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0, 8, 24, 0.06), 0 1px 2px rgba(0, 8, 24, 0.04)",
        "card-md": "0 4px 16px rgba(0, 8, 24, 0.08)",
        "card-hover": "0 12px 32px rgba(0, 8, 24, 0.12)",
      },
      maxWidth: {
        "8xl": "88rem",
      },
    },
  },
  plugins: [],
};
