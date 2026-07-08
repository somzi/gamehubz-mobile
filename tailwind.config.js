/** @type {import('tailwindcss').Config} */
const { COLORS } = require('./src/lib/theme');

module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Background colors - matching premium profile design
        background: COLORS.background,
        "background-deep": COLORS.backgroundDeep,
        foreground: COLORS.foreground, // Slate-50

        // Card colors
        card: COLORS.card,
        "card-foreground": COLORS.foreground,
        "card-elevated": COLORS.cardElevated,

        // Popover
        popover: COLORS.card,
        "popover-foreground": COLORS.foreground,

        // Primary - Emerald (matching premium design)
        primary: COLORS.primary,
        "primary-bright": COLORS.primaryBright,
        "primary-foreground": COLORS.primaryForeground,

        // Secondary
        secondary: COLORS.cardElevated,
        "secondary-foreground": "#F1F5F9",

        // Muted
        muted: COLORS.cardElevated,
        "muted-foreground": COLORS.slate400, // Slate-400

        // Accent - Emerald/Teal
        accent: COLORS.primary,
        "accent-foreground": COLORS.primaryForeground,

        // Status colors
        destructive: COLORS.destructive,
        "destructive-foreground": COLORS.foreground,
        success: COLORS.primary,
        "success-foreground": COLORS.foreground,
        live: COLORS.live,
        "live-foreground": COLORS.foreground,
        warning: COLORS.warning,
        highlight: COLORS.highlight,
        info: COLORS.info,
        team: COLORS.team,
        "team-foreground": COLORS.teamForeground,

        // Border and input
        border: COLORS.border,
        "border-subtle": COLORS.borderSubtle,
        input: COLORS.input,
        ring: COLORS.primary,
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.25rem",
      },
    },
  },
  plugins: [],
}
