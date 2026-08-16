// ============================================================
// Educarelink — Bảng màu & Design System chung cho toàn bộ ứng dụng
// Lấy cảm hứng từ bTaskee: tông cam ấm, trắng sạch, dễ nhìn
// Cải thiện theo taste-skill: colored shadows, refined spacing, typography
// ============================================================
// QA-FIX-UI: bổ sung token từ Warm Professionalism design system
// (DESIGN.md) — thêm SONG SONG bên cạnh token cũ để các màn hình
// chưa redesign vẫn chạy đúng. Không đổi tên/xoá token cũ.
// ============================================================

export const COLORS = {
  // Màu chính (Primary) — Cam ấm bTaskee-style
  // NOTE: trong DESIGN.md, `primary-container: '#f26522'` là cam sáng
  // (CTA buttons, badges) — KHỚP VỚI `COLORS.primary` hiện tại.
  // Còn `primary: '#a63b00'` (cam đất đậm) chỉ dùng cho text/icon cần
  // tương phản cao → map sang `COLORS.primaryDeep` mới.
  primary:       '#F26522',   // cam chủ đạo (= primary-container trong DESIGN.md)
  primaryDark:   '#D4541E',   // cam đậm (pressed state)
  primaryLight:  '#FFF4ED',   // cam nhạt (background highlight)
  primarySoft:   '#FFCFB3',   // cam pastel nhẹ
  // Warm Professionalism tokens (mới)
  primaryDeep:          '#a63b00',  // primary trong DESIGN.md — text/icon cam đậm
  onPrimaryContainer:   '#4f1800',  // text trên nền cam sáng (tương phản mạnh)
  primaryFixedDim:      '#ffb599',  // cam pastel đậm hơn primarySoft

  // Màu phụ (Secondary) — Xanh lá tươi cho sinh viên
  // NOTE: trong DESIGN.md, `secondary-container: '#76fa84'` (pastel sáng)
  // dùng cho badge "Verified" CarePartner — sáng hơn `COLORS.secondary`
  // hiện tại. Thêm `secondaryContainer` mới để dùng khi thiết kế yêu cầu.
  secondary:     '#2DB84B',   // xanh lá tươi (= secondary trong DESIGN.md description)
  secondaryDark: '#1E9439',
  secondaryLight:'#EAFBEF',
  // Warm Professionalism tokens (mới)
  secondaryContainer:   '#76fa84',  // pastel sáng — badge Verified, chip CarePartner
  onSecondaryContainer: '#007326',  // text trên nền secondaryContainer

  // Nền & Bề mặt — Warm Professionalism surface tokens
  background:    '#F7F7F7',   // nền xám rất nhạt (giữ nguyên — DEV note: DESIGN.md dùng #fff8f6 ấm hơn, nhưng giữ #F7F7F7 để không phá các màn chưa redesign)
  surface:       '#FFFFFF',   // card trắng
  surfaceAlt:    '#FFF9F5',   // card nền cam nhạt
  // Warm Professionalism surface tokens (mới) — layered surfaces ấm hơn
  surfaceWarm:          '#fff8f6',  // background ấm (DESIGN.md background)
  surfaceContainerLow:  '#fff1ec',  // nền card nhạt (DESIGN.md surface-container-low)
  surfaceContainer:     '#ffe9e2',  // nền card vừa (DESIGN.md surface-container)
  surfaceContainerHigh: '#fde3da',  // nền card đậm (DESIGN.md surface-container-high)
  surfaceDim:           '#eed5cc',  // nền mờ (DESIGN.md surface-dim)

  // Text — giữ nguyên + bổ sung onSurfaceVariant theo DESIGN.md
  textPrimary:   '#1A1A2E',   // tiêu đề, chữ chính (gần khớp on-surface #261813 trong DESIGN.md)
  textSecondary: '#6B7280',   // chữ phụ
  textMuted:     '#6B7280',   // ⚡ UX fix: đổi từ #9CA3AF → #6B7280 (WCAG AA pass, contrast 5.4:1)
  textOnPrimary: '#FFFFFF',   // chữ trên nền cam
  // Warm Professionalism text tokens (mới)
  onSurface:          '#261813',  // text chính ấm (DESIGN.md on-surface)
  onSurfaceVariant:   '#594138',  // text phụ ấm (DESIGN.md on-surface-variant)

  // Trạng thái — giữ nguyên, lưu ý DESIGN.md dùng error #ba1a1a đậm hơn
  success:       '#10B981',
  successBg:     '#ECFDF5',
  successDeep:   '#1E9439',  // QA-FIX-UI 2.1: text/icon trên nền successBg (đậm hơn success cho contrast AAA)
  warning:       '#F59E0B',
  warningBg:     '#FFFBEB',
  error:         '#EF4444',
  errorBg:       '#FEF2F2',
  info:          '#3B82F6',
  infoBg:        '#EFF6FF',
  // Warm Professionalism error (mới) — đậm hơn, dùng khi cần khớp DESIGN.md
  errorDeep:     '#ba1a1a',
  errorContainer:'#ffdad6',

  // Tier badge tokens (QA-FIX-UI 3.1) — tông be/vàng ấm khớp screen.png
  // Tránh #FFD700 (vàng kim loại chói) và #6B7280 (xám lạnh) không thuộc
  // bảng Warm Professionalism.
  tierGold:      '#a67c00',  // text/icon Hạng Vàng — vàng hổ phách ấm
  tierGoldBg:    '#fff4d6',  // nền Hạng Vàng — be vàng nhạt
  tierSilver:    '#7d6a5d',  // text/icon Hạng Bạc — nâu xám ấm
  tierSilverBg:  '#f0e6df',  // nền Hạng Bạc — be nhạt
  ratingStar:    '#f59e0b',  // sao đánh giá — cam vàng ấm (khớp warning)

  // Border & Divider — giữ nguyên + bổ sung outline ấm theo DESIGN.md
  border:        '#F0F0F0',
  divider:       '#E5E7EB',
  borderHover:   '#D1D5DB',
  // Warm Professionalism outline tokens (mới) — viền ấm pha cam
  outline:          '#8d7166',  // viền chính (DESIGN.md outline)
  outlineVariant:   '#e1bfb3',  // viền phụ nhạt (DESIGN.md outline-variant)

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
// QA-FIX-UI: thêm fontFamily cho từng cấp độ theo DESIGN.md.
// Font files được load trong App.js qua useFonts() — không load ở đây.
// Khi dùng: <Text style={[TYPO.h1, { fontFamily: TYPO.h1.fontFamily }]}>
// Hoặc đơn giản: <Text style={TYPO.h1}> — fontFamily đã có sẵn trong object.
export const TYPO = {
  // Headlines — Manrope (bold, tight tracking)
  // DESIGN.md: h1=800/28px, h2=800/22px, h3=800/18px, h4=700/16px
  h1: { fontFamily: 'Manrope_800ExtraBold', fontSize: 28, fontWeight: '800', letterSpacing: -0.5, lineHeight: 34 },
  h2: { fontFamily: 'Manrope_800ExtraBold', fontSize: 22, fontWeight: '800', letterSpacing: -0.3, lineHeight: 28 },
  h3: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, fontWeight: '800', letterSpacing: -0.2, lineHeight: 24 },
  h4: { fontFamily: 'Manrope_700Bold',      fontSize: 16, fontWeight: '700', letterSpacing: 0,   lineHeight: 22 },
  h5: { fontFamily: 'Manrope_700Bold',      fontSize: 14, fontWeight: '700', letterSpacing: 0.1, lineHeight: 20 },

  // Body — Plus Jakarta Sans (comfortable, readable)
  // DESIGN.md: body=500/15px, caption=700/12px
  body:       { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 15, fontWeight: '500', letterSpacing: 0.1, lineHeight: 22 },
  bodyLarge:  { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 17, fontWeight: '600', letterSpacing: 0,   lineHeight: 24 },
  bodySmall:  { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, fontWeight: '500', letterSpacing: 0.1, lineHeight: 18 },

  // Utility — ⚡ UX fix: tăng font size cho WCAG AA compliance (≥14pt body)
  caption:      { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, fontWeight: '700', letterSpacing: 0.5, lineHeight: 16 },
  overline:     { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, lineHeight: 14 },
  button:       { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, fontWeight: '700', letterSpacing: 0.2, lineHeight: 20 },
  buttonSmall:  { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, fontWeight: '700', letterSpacing: 0.3, lineHeight: 18 },
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
