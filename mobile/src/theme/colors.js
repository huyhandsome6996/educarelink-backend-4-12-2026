// ============================================================
// Educarelink — Bảng màu chung cho toàn bộ ứng dụng
// Lấy cảm hứng từ bTaskee: tông cam ấm, trắng sạch, dễ nhìn
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

  // Shadows
  shadow:        '#000000',
};

export const SHADOWS = {
  small: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  medium: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  large: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
};

export const SIZES = {
  // Border radius
  radiusSm: 8,
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
