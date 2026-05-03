import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#08090b",
          subtle: "#0d1014",
          elevated: "#11151a",
          hover: "#171c22",
        },
        border: {
          subtle: "#1c2127",
          DEFAULT: "#272d36",
          strong: "#3a4150",
        },
        ink: {
          primary: "#e8ecf2",
          secondary: "#9aa6b8",
          tertiary: "#5b6470",
          muted: "#3a4150",
        },
        signal: {
          buy: "#3fb950",
          buy_soft: "#1a3324",
          hold: "#8b949e",
          sell: "#f85149",
          sell_soft: "#3a1a1a",
          warn: "#d4a72c",
          warn_soft: "#3a2a0a",
          info: "#5fa8e8",
          info_soft: "#10243a",
        },
        accent: {
          DEFAULT: "#56d364",
          hover: "#3fb950",
          muted: "#1a3324",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(86,211,100,0.2), 0 0 24px -4px rgba(86,211,100,0.25)",
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.5)",
        elev: "0 8px 24px -8px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04) inset",
      },
      backgroundImage: {
        "grid": "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
        "radial-fade": "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(86,211,100,0.08), transparent 70%)",
      },
      backgroundSize: {
        "grid-sm": "32px 32px",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "agent-orbit": "orbit 16s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        orbit: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
