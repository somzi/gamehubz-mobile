/** @type {import('tailwindcss').Config} */
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
        background: "#0F172A",
        foreground: "#F8FAFC", // Slate-50

        // Card colors
        card: "#131B2E",
        "card-foreground": "#F8FAFC",
        "card-elevated": "#1E293B",

        // Popover
        popover: "#131B2E",
        "popover-foreground": "#F8FAFC",

        // Primary - Emerald (matching premium design)
        primary: "#10B981",
        "primary-foreground": "#0F172A",

        // Secondary
        secondary: "#1E293B",
        "secondary-foreground": "#F1F5F9",

        // Muted
        muted: "#1E293B",
        "muted-foreground": "#94A3B8", // Slate-400

        // Accent - Emerald/Teal
        accent: "#10B981",
        "accent-foreground": "#0F172A",

        // Status colors
        destructive: "#EF4444",
        "destructive-foreground": "#F8FAFC",
        success: "#10B981",
        "success-foreground": "#F8FAFC",
        live: "#F43F5E",
        "live-foreground": "#F8FAFC",

        // Border and input
        border: "rgba(255, 255, 255, 0.1)",
        input: "rgba(255, 255, 255, 0.05)",
        ring: "#10B981",
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
