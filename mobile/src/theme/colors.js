// ============================================================
// EduCarelink — Warm Professionalism Design System
// Source: stitch_educarelink_redesign_system / DESIGN.md
// Token names mirror Material 3 surface-container hierarchy.
// ============================================================

export const COLORS = {
  // === Primary ===
  // Design uses TWO primary tokens:
  //   - primaryText (#a63b00): dark warm orange for titles / display text
  //   - primary      (#f26522): vibrant orange for buttons / FAB / accents
  // For backwards-compat, `primary` keeps the vibrant orange value.
  primary:       '#F26522',   // primary-container in design (buttons, FAB)
  primaryText:   '#A63B00',   // primary in design (titles, brand text)
  primaryDark:   '#D4541E',   // pressed state
  primaryLight:  '#FFF4ED',   // highlight tint (large bg blocks)
  primarySoft:   '#FFCFB3',
  primaryFixed:  '#FFDBCE',
  primaryFixedDim:'#FFB599',

  // === Secondary (CarePartner identity — green) ===
  secondary:       '#2DB84B',
  secondaryDeep:   '#006E24',   // design "secondary"
  secondaryDark:   '#1E9439',
  secondaryLight:  '#EAFBEF',
  secondaryContainer:'#76FA84',

  // === Tertiary (info / links — blue) ===
  tertiary:        '#006492',
  tertiaryContainer:'#009ADE',
  tertiaryFixed:   '#CAE6FF',
  tertiaryFixedDim:'#8CCEFF',

  // === Aliases (legacy / convenience) ===
  onSurface:       '#261813',     // alias for textOnSurface
  surfaceWarm:     '#FFF1EC',     // alias for surfaceContainerLow (warm cream tint)

  // === Surfaces (Warm Professionalism palette) ===
  background:      '#FFF8F6',  // app background — warm cream
  surface:         '#FFF8F6',  // surface (same warm cream)
  surfaceDim:      '#EED5CC',
  surfaceBright:   '#FFF8F6',
  surfaceContainerLowest:  '#FFFFFF',  // pure white cards
  surfaceContainerLow:     '#FFF1EC',
  surfaceContainer:        '#FFE9E2',
  surfaceContainerHigh:    '#FDE3DA',
  surfaceContainerHighest: '#F7DDD4',
  surfaceVariant:          '#F7DDD4',
  surfaceAlt:              '#FFF9F5',  // legacy alias

  // === Text ===
  textPrimary:     '#261813',  // on-surface (warm dark brown-black)
  textSecondary:   '#594138',  // on-surface-variant
  textMuted:       '#6B7280',  // keep for legacy UI elements
  textOnPrimary:   '#FFFFFF',
  textOnSurface:   '#261813',
  textOnSurfaceVariant: '#594138',

  // === Outline / Border ===
  outline:         '#8D7166',
  outlineVariant:  '#E1BFB3',
  border:          '#F0F0F0',     // legacy input border
  borderHover:     '#D1D5DB',
  divider:         '#E5E7EB',

  // === Status ===
  success:         '#10B981',
  successBg:       '#ECFDF5',
  successDeep:     '#1E9439',
  successBgDeep:   '#EAFBEF',
  warning:         '#F59E0B',
  warningBg:       '#FFFBEB',
  warningDeep:     '#B45309',
  error:           '#BA1A1A',
  errorBg:         '#FEF2F2',
  errorDeep:       '#93000A',
  info:            '#006492',
  infoBg:          '#EFF6FF',

  // === Shadows ===
  shadow:          '#000000',
};

// === COLORED SHADOWS (warm-tinted per design spec) ===
export const SHADOWS = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  large: {
    // Orange glow — reserved for FAB & primary CTA
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 8,
  },
  cardHover: {
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  inputFocus: {
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
};

export const SIZES = {
  // Border radius (Warm Professionalism shape language — "Extra-Soft")
  radiusXs: 4,
  radiusSm: 8,
  radiusMd: 14,    // buttons, inputs
  radiusLg: 20,    // standard cards (hallmark)
  radiusXl: 28,    // large header containers
  radiusFull: 999,

  // Spacing (8px base unit)
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  marginMobile: 20,
  gutterMobile: 12,
};

// === TYPOGRAPHY ===
// Manrope for headlines (tight tracking, blocky authoritative look)
// Plus Jakarta Sans for body (open counters, soft curves)
// In RN we approximate via fontWeight + letterSpacing (system sans-serif fallback).
// To enable true Manrope / Plus Jakarta Sans later, install
//   @expo-google-fonts/manrope  +  @expo-google-fonts/plus-jakarta-sans
// and load via useFonts() in App.js, then add fontFamily back here.
export const TYPO = {
  // Headlines — Manrope approximation
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.56, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '800', letterSpacing: -0.22, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '800', letterSpacing: -0.18, lineHeight: 24 },
  h4: { fontSize: 16, fontWeight: '700', letterSpacing: 0,    lineHeight: 22 },
  h5: { fontSize: 14, fontWeight: '700', letterSpacing: 0.1,  lineHeight: 20 },

  // Body — Plus Jakarta Sans approximation
  body:       { fontSize: 15, fontWeight: '500', letterSpacing: 0.1, lineHeight: 24 },
  bodyLarge:  { fontSize: 17, fontWeight: '600', letterSpacing: 0,   lineHeight: 24 },
  bodySmall:  { fontSize: 13, fontWeight: '500', letterSpacing: 0.1, lineHeight: 18 },

  // Utility
  caption:   { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, lineHeight: 16 },
  overline:  { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, lineHeight: 14 },
  button:    { fontSize: 16, fontWeight: '700', letterSpacing: 0.2, lineHeight: 20 },
  buttonSmall:{ fontSize: 14, fontWeight: '700', letterSpacing: 0.3, lineHeight: 18 },
};

// === ANIMATION PRESETS ===
export const ANIM = {
  spring: { tension: 60, friction: 8 },
  springGentle: { tension: 40, friction: 10 },
  timingFast: 150,
  timingNormal: 250,
  timingSlow: 400,
};

// === COMMON STYLE FRAGMENTS ===
export const FRAGMENTS = {
  inputFocus: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  cardPress: {
    transform: [{ scale: 0.98 }],
  },
  buttonActive: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
};
