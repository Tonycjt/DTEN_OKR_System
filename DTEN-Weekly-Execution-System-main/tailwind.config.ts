import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#172033",
          800: "#29364d",
          600: "#566278",
        },
        surface: {
          50: "#f7f9fb",
          100: "#eef3f7",
        },
        dten: {
          blue: "#175cd3",
          teal: "#0f8f8c",
          green: "#287d3c",
          amber: "#b76e00",
          red: "#b42318",
        },
      },
      boxShadow: {
        soft: "0 14px 35px rgba(23, 32, 51, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
