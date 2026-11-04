import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0c0c0e",
          raised: "#141418",
          overlay: "#1a1a20",
        },
        border: {
          DEFAULT: "#27272a",
          subtle: "#1f1f23",
        },
        accent: {
          cyan: "#22d3ee",
          violet: "#a78bfa",
          muted: "#0891b2",
        },
      },
    },
  },
  plugins: [],
};

export default config;
