// Shared theme tokens extracted from the union of all per-template inline
// `tailwind.config` blocks that used to ship via the CDN script tag.
//
// Two near-duplicate tokens were found with slightly different hex values
// across templates (visually imperceptible, <3 RGB points apart) and were
// canonicalized to whichever value the majority of templates used:
//   - secondaryDark: was '#239A3C' in splash.html only, '#1E9439' everywhere
//     else (10 templates) -> canonicalized to '#1E9439'.
//   - secondaryLight: was '#EDFBF0' in splash.html only, '#EAFBEF' everywhere
//     else (10 templates) -> canonicalized to '#EAFBEF'.
//
// borderRadius was NOT unioned here because 3 templates groups use 3 real,
// visually-different custom scales (see build-a.config.js / build-b.config.js
// / build-default.config.js) -- that is a genuine per-page difference, not a
// typo, so each group gets its own build to preserve exact current appearance.

module.exports = {
  colors: {
    primary: '#F26522',
    primaryDark: '#D4541E',
    primaryLight: '#FFF4ED',
    primarySoft: '#FFCFB3',
    secondary: '#2DB84B',
    secondaryDark: '#1E9439',
    secondaryLight: '#EAFBEF',
    background: '#F7F7F7',
    bg: '#F7F7F7',
    bgMain: '#F7F7F7',
    surface: '#FFFFFF',
    surfaceAlt: '#FFF9F5',
    textPrimary: '#1A1A2E',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    textOnPrimary: '#FFFFFF',
    border: '#F0F0F0',
    borderMain: '#F0F0F0',
    divider: '#E5E7EB',
    dividerMain: '#E5E7EB',
    success: '#10B981',
    successMain: '#10B981',
    successBg: '#ECFDF5',
    error: '#EF4444',
    errorMain: '#EF4444',
    errorBg: '#FEF2F2',
    info: '#3B82F6',
    infoMain: '#3B82F6',
    infoBg: '#EFF6FF',
    warning: '#F59E0B',
    warningMain: '#F59E0B',
    warningBg: '#FFFBEB',
    hcBlue: '#2563EB',
    hcBlueDark: '#1D4ED8',
    hcBlueLight: '#EFF6FF',
    hcBlueSoft: '#DBEAFE',
  },
  fontFamily: {
    display: ['Manrope', 'sans-serif'],
    headline: ['Manrope', 'sans-serif'],
    manrope: ['Manrope', 'sans-serif'],
    body: ['Plus Jakarta Sans', 'sans-serif'],
    label: ['Plus Jakarta Sans', 'sans-serif'],
    jakarta: ['Plus Jakarta Sans', 'sans-serif'],
  },
};
