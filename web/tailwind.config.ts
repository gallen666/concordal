import type { Config } from "tailwindcss";

/**
 * Bloomberg-grade design tokens.
 *
 * Color philosophy: deep terminal black, Bloomberg cream for body text,
 * amber/orange as primary accent (replacing the prior green), terminal
 * cyan for inline links and metadata. Buy/sell stay universal green/red.
 *
 * Surface ramp uses 5 stops so cards over cards feel layered without
 * relying on shadow. Borders are quieter so the eye lands on data, not
 * chrome. Radius is reduced from 12px to 4px throughout — Bloomberg's
 * signature feel is tight rectangles, not pill UI.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces — 5-stop ramp from pure terminal black up to elevated
        bg: {
          base:     "#0A0E13",  // page background
          subtle:   "#0E1318",  // inset rows, table stripes
          elevated: "#131A22",  // cards
          raised:   "#1A2330",  // popovers, hover states on cards
          hover:    "#1F2937",  // row hover
        },
        // Borders — almost invisible by default, scaled up for emphasis
        border: {
          subtle:  "#1C232E",
          DEFAULT: "#283040",
          strong:  "#3D4A5C",
        },
        // Ink — Bloomberg cream as the primary text colour. The cream
        // is what makes a terminal look "expensive" rather than "OS dark mode".
        ink: {
          primary:   "#E8DCC4",  // Bloomberg cream
          secondary: "#A8A089",
          tertiary:  "#6B6855",
          muted:     "#3D3A2E",
        },
        // Signal colours — universal up/down semantics, used for buy/sell
        // chips, P&L numbers, status indicators.
        signal: {
          buy:       "#3FB950",
          buy_soft:  "#16291C",
          hold:      "#A8A089",
          sell:      "#F85149",
          sell_soft: "#2D0F12",
          warn:      "#FFB020",
          warn_soft: "#2E1F0A",
          info:      "#5BC0EB",  // terminal cyan — used for links/info
          info_soft: "#0C2230",
        },
        // Accent — Bloomberg amber. Used for primary CTAs, pill borders,
        // chart highlights. Replaces the prior green.
        accent: {
          DEFAULT: "#FF7A00",  // Bloomberg amber
          hover:   "#FF9933",
          muted:   "#3D2810",
          glow:    "#FFB000",
        },
      },
      fontFamily: {
        // Inter is kept — it's the cleanest sans for finance data.
        // IBM Plex Serif handles editorial moments (display headlines).
        // JetBrains Mono for all numbers/tickers/code.
        sans:    ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["IBM Plex Serif", "Georgia", "ui-serif", "serif"],
        mono:    ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      letterSpacing: {
        tighter: "-0.04em",
        kicker:  "0.18em",  // section ALL-CAPS labels
      },
      borderRadius: {
        // Reduce overall radius — Bloomberg is squared, not pill.
        DEFAULT: "3px",
        md:      "4px",
        lg:      "6px",
        xl:      "8px",
      },
      boxShadow: {
        // Glow uses amber instead of green
        glow: "0 0 0 1px rgba(255,122,0,0.25), 0 0 24px -4px rgba(255,122,0,0.30)",
        // Card shadow: 1px inset hairline + soft drop for layering
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.5)",
        elev: "0 8px 24px -8px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04) inset",
        // Terminal-style focus ring
        focus: "0 0 0 2px rgba(255,122,0,0.40)",
      },
      backgroundImage: {
        "grid":        "linear-gradient(rgba(232,220,196,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(232,220,196,0.025) 1px, transparent 1px)",
        "radial-fade": "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,122,0,0.10), transparent 70%)",
        "ticker-fade": "linear-gradient(90deg, transparent 0%, #0A0E13 5%, #0A0E13 95%, transparent 100%)",
      },
      backgroundSize: {
        "grid-sm": "24px 24px",
      },
      animation: {
        "fade-in":    "fadeIn 0.4s ease-out",
        "slide-up":   "slideUp 0.5s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "agent-orbit":"orbit 16s linear infinite",
        "blink":      "blink 1.2s steps(2) infinite",
        "ticker":     "ticker 40s linear infinite",
      },
      keyframes: {
        fadeIn:   { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp:  { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        orbit:    { "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } },
        blink:    { "0%, 49%": { opacity: "1" }, "50%, 100%": { opacity: "0" } },
        ticker:   { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
      },
    },
  },
  plugins: [],
};

export default config;
