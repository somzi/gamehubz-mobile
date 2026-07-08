// Single source of truth for the app palette. tailwind.config.js requires this
// file for className tokens; TS/TSX code imports COLORS for the places NativeWind
// can't reach (Ionicons `color`, LinearGradient `colors`, shadowColor, tintColor,
// StyleSheet values). Plain CommonJS so both Node (tailwind) and Metro can load it.
const COLORS = {
    // Surfaces
    background: '#0F172A',
    backgroundDeep: '#0B1120', // tab bar, chat composer, darkest chrome
    card: '#131B2E',
    cardElevated: '#1E293B',

    // Text
    foreground: '#F8FAFC',
    slate200: '#E2E8F0',
    slate300: '#CBD5E1',
    slate400: '#94A3B8', // muted-foreground
    slate500: '#64748B',
    slate600: '#475569',
    slate700: '#334155',

    // Brand / accents
    primary: '#10B981',
    primaryBright: '#34D399', // active-state emerald (PremiumTabs)
    primaryForeground: '#0F172A',
    warning: '#F59E0B', // "needs attention", admin-help
    highlight: '#A78BFA', // highlights / feed accents
    info: '#818CF8', // tournaments accent
    team: '#00E5A0', // team-tournament accent (dashboard, registration)
    teamForeground: '#06251D',

    // Status
    destructive: '#EF4444',
    live: '#F43F5E',

    // Lines & inputs
    border: 'rgba(255, 255, 255, 0.1)',
    borderSubtle: 'rgba(255, 255, 255, 0.05)',
    input: 'rgba(255, 255, 255, 0.05)',
};

module.exports = { COLORS };
