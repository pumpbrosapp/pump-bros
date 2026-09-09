// Shared design tokens — Cal AI-inspired visual style.
// Warm off-white background, big soft rounded cards, bold oversized
// numbers, muted gray secondary text, and thin ring accents.

export const colors = {
  background: '#FFFFFF',
  backgroundGradientTop: '#EAE5E7',
  card: '#FFFFFF',
  cardBorder: '#EFEAE5',

  textPrimary: '#0D0D0D',
  textSecondary: '#9B9B9F',
  textTertiary: '#C4C2C6',

  iconDark: '#0D0D0D',
  iconOnDark: '#FFFFFF',

  ringTrack: '#EFEAE5',

  navActive: '#0D0D0D',
  navInactive: '#ACAAB0',
  navActiveBg: '#EFEDF3',

  shadow: '#000000',
};

export const radius = {
  card: 28,
  cardSmall: 22,
  pill: 999,
  chip: 16,
  avatar: 20,
};

export const type = {
  giant: 52, // headline numbers, e.g. "1000"
  pageTitle: 30, // top-of-screen page / app name (Pump Bros, Progress, Social, Profile)
  statValue: 22, // e.g. "100g"
  sectionTitle: 17,
  body: 14,
  label: 12,
  caption: 11,
  navLabel: 10,
};

export const shadow = {
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 3,
  },
  nav: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 6,
  },
};
