// ============================================================
// Educarelink — Bảng màu & Design System chung cho toàn bộ ứng dụng
// Lấy cảm hứng từ bTaskee: tông cam ấm, trắng sạch, dễ nhìn
// Cải thiện theo taste-skill: colored shadows, refined spacing, typography
// ============================================================

export const COLORS = {
  // Màu chính (Primary) — Cam ấm bTaskee-style
  primary:       '#F26522',   // cam chủ đạo
  primaryDark:   '#D4541E',   // cam đậm (pressed state)
  primaryLight:  '#FFF4ED',   // cam nhạt (background highlight)
  primarySoft:   '#FFCFB3',   // cam pastel nhẹ

  // Màu phụ (Secondary) — Xanh lá tươi cho sinh viên
  secondary:     '#2DB84B',   // xanh lá tươi
  secondaryDark: '#1E9439',
  secondaryLight:'#EAFBEF',

  // Nền & Bề mặt
  background:    '#F7F7F7',   // nền xám rất nhạt
  surface:       '#FFFFFF',   // card trắng
  surfaceAlt:    '#FFF9F5',   // card nền cam nhạt

  // Text
  textPrimary:   '#1A1A2E',   // tiêu đề, chữ chính
  textSecondary: '#6B7280',   // chữ phụ
  textMuted:     '#9CA3AF',   // chữ rất nhạt
  textOnPrimary: '#FFFFFF',   // chữ trên nền cam

  // Trạng thái
  success:       '#10B981',
  successBg:     '#ECFDF5',
  warning:       '#F59E0B',
  warningBg:     '#FFFBEB',
  error:         '#EF4444',
  errorBg:       '#FEF2F2',
  info:          '#3B82F6',
  infoBg:        '#EFF6FF',

  // Border & Divider
  border:        '#F0F0F0',
  divider:       '#E5E7EB',
  borderHover:   '#D1D5DB',

  // Shadows
  shadow:        '#000000',
};

// === COLORED SHADOWS (taste-skill principle) ===
// Thay vì dùng shadow đen đơn điệu, dùng shadow pha màu primary
export const SHADOWS = {
  small: {
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
  },
  medium: {
    boxShadow: '0px 4px 14px rgba(0, 0, 0, 0.07)',
  },
  large: {
    boxShadow: '0px 6px 20px rgba(242, 101, 34, 0.2)',
  },
  // Colored shadow cho card khi press/hover
  cardHover: {
    boxShadow: '0px 4px 16px rgba(242, 101, 34, 0.12)',
  },
  // Subtle shadow cho input focus
  inputFocus: {
    boxShadow: '0px 2px 8px rgba(242, 101, 34, 0.1)',
  },
};

export const SIZES = {
  // Border radius — slightly softer per taste-skill
  radiusXs: 6,
  radiusSm: 10,
  radiusMd: 14,
  radiusLg: 20,
  radiusXl: 28,
  radiusFull: 999,

  // Spacing
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// === TYPOGRAPHY (taste-skill: Manrope headlines, Plus Jakarta Sans body) ===
export const TYPO = {
  // Headlines — Manrope style (bold, tight tracking)
  h1: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2, lineHeight: 24 },
  h4: { fontSize: 16, fontWeight: '700', letterSpacing: 0, lineHeight: 22 },
  h5: { fontSize: 14, fontWeight: '700', letterSpacing: 0.1, lineHeight: 20 },

  // Body — Plus Jakarta Sans style (comfortable, readable)
  body: { fontSize: 15, fontWeight: '500', letterSpacing: 0.1, lineHeight: 22 },
  bodyLarge: { fontSize: 17, fontWeight: '600', letterSpacing: 0, lineHeight: 24 },
  bodySmall: { fontSize: 13, fontWeight: '500', letterSpacing: 0.1, lineHeight: 18 },

  // Utility
  caption: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, lineHeight: 16 },
  overline: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, lineHeight: 14 },
  button: { fontSize: 16, fontWeight: '800', letterSpacing: 0.2, lineHeight: 20 },
  buttonSmall: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3, lineHeight: 18 },
};

// === ANIMATION PRESETS (taste-skill: smooth transitions) ===
export const ANIM = {
  spring: { tension: 60, friction: 8 },
  springGentle: { tension: 40, friction: 10 },
  timingFast: 150,
  timingNormal: 250,
  timingSlow: 400,
};

// === COMMON STYLE FRAGMENTS ===
export const FRAGMENTS = {
  // Input focus state (taste-skill: visible focus rings)
  inputFocus: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  // Card press effect (taste-skill: lift on press)
  cardPress: {
    transform: [{ scale: 0.98 }],
  },
  // Button active state
  buttonActive: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
};
