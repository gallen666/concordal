import type { Config } from "tailwindcss";

/**
 * "Editorial Dialectic" design tokens.
 *
 * Rationale: TradingAgents' unique mechanism is the bull/bear debate. The
 * visual identity should foreground OPPOSITION — two muted but distinct
 * colours that live alongside each other, rather than a single accent.
 *
 * Palette:
 *  - Bg: warm near-black, like the reverse of an old newspaper page.
 *  - Ink: warm cream, slightly softer than Bloomberg's.
 *  - Bull / Bear: muted jade green + muted brick red — NOT the bright
 *    signal-green/red used for actual P&L numbers. These represent the
 *    *argument*, not the call.
 *  - Gold: a single warm gold for editorial highlights and the live
 *    "manager call" badge. Used sparingly.
 *
 * Typography: Crimson Pro for display headlines (op-ed gravitas), Inter
 * for body, JetBrains Mono for data. Tight tracking on display.
 *
 * Spacing: generous — the page should feel paced like a long-read essay,
 * not a dashboard.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces — warm near-black, paper-back-feel
        bg: {
          base:     "#0E0C0A",
          subtle:   "#15110D",
          elevated: "#1B1611",
          raised:   "#231C16",
          hover:    "#2B2218",
        },
        border: {
          subtle:  "#221C16",
          DEFAULT: "#2F2620",
          strong:  "#4A3C32",
        },
        ink: {
          primary:   "#EDE6D8",  // warm cream
          secondary: "#B5AC9C",
          tertiary:  "#7A7163",
          muted:     "#4A4339",
        },
        // The dialectic — used for the bull/bear debate columns,
        // pill chips, dividers. Muted, like a magazine print palette.
        bull: {
          DEFAULT: "#5A8A6F",  // muted jade
          soft:    "#1A2E22",
          ink:     "#9CC5A8",
        },
        bear: {
          DEFAULT: "#A0524A",  // muted brick
          soft:    "#2E1A17",
          ink:     "#D08A82",
        },
        // The neutral "manager" / editorial highlight
        gold: {
          DEFAULT: "#C9A961",
          soft:    "#2E2510",
          deep:    "#7C6230",
        },
        // Universal P&L semantics — kept separate from bull/bear so a
        // BUY recommendation can be jade-tinted while its 5% gain still
        // glows the standard money-green.
        signal: {
          buy:       "#3FB950",
          buy_soft:  "#16291C",
          hold:      "#A8A089",
          sell:      "#F85149",
          sell_soft: "#2D0F12",
          warn:      "#C9A961",
          warn_soft: "#2E2510",
          info:      "#7DB3D8",
          info_soft: "#152330",
        },
        // Accent token kept as an alias of gold so existing pages that
        // reference `bg-accent` keep working without rewrite.
        accent: {
          DEFAULT: "#C9A961",
          hover:   "#D9BB78",
          muted:   "#2E2510",
          glow:    "#E0C480",
        },
        // v47: McKinsey strategy doc brand tokens — additive, non-breaking.
        // Used for: /enterprise, /research, /compliance, /benchmark pages
        // and any pre-IPO / institutional-facing context. Existing pages
        // continue to use the "editorial dialectic" palette (jade/brick).
        verdict: {
          gold:      "#D4AF37",  // brighter, more "verdict" feel
          gold_deep: "#8B7C2A",
          gold_soft: "#322716",
          blue:      "#0A1F44",  // deep well blue — institutional gravitas
          blue_soft: "#142850",
          parchment: "#F4ECD8",  // warm cream for high-end paper-feel surfaces
        },
        // Concord brand color — used wherever we surface the 协奏 wordmark.
        concord: {
          DEFAULT: "#D4AF37",
          dark:    "#0A1F44",
          paper:   "#F4ECD8",
        },
      },
      fontFamily: {
        sans:    ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Crimson Pro", "Crimson Text", "Georgia", "ui-serif", "serif"],
        mono:    ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        // Editorial display sizes — wider than utility scale
        "display-sm": ["3rem",   { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        "display-md": ["4.5rem", { lineHeight: "1.0",  letterSpacing: "-0.035em" }],
        "display-lg": ["6rem",   { lineHeight: "0.95", letterSpacing: "-0.04em" }],
      },
      letterSpacing: {
        tighter: "-0.04em",
        kicker:  "0.18em",
      },
      borderRadius: {
        DEFAULT: "3px",
        md:      "4px",
        lg:      "6px",
        xl:      "8px",
      },
      boxShadow: {
        glow:  "0 0 0 1px rgba(201,169,97,0.25), 0 0 24px -4px rgba(201,169,97,0.20)",
        card:  "0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.5)",
        elev:  "0 8px 24px -8px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04) inset",
        focus: "0 0 0 2px rgba(201,169,97,0.40)",
      },
      backgroundImage: {
        "paper-noise":    "radial-gradient(rgba(237,230,216,0.018) 1px, transparent 1px)",
        "radial-fade":    "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(201,169,97,0.08), transparent 70%)",
        "bull-bear-fade": "linear-gradient(90deg, rgba(90,138,111,0.06) 0%, transparent 30%, transparent 70%, rgba(160,82,74,0.06) 100%)",
      },
      backgroundSize: {
        "noise-sm": "3px 3px",
      },
      animation: {
        "fade-in":  "fadeIn 0.6s ease-out",
        "slide-up": "slideUp 0.7s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "ticker":   "ticker 50s linear infinite",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        ticker:  { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
      },
    },
  },
  plugins: [],
};

export default config;
