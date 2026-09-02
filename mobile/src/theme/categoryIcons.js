// ============================================================
// EduCareLink — Category Icons (đồng bộ 100% với web)
// Web dùng Material Symbols (font icon), mobile dùng Ionicons
// (gần nhất với Material Symbols trong @expo/vector-icons)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { COLORS } from './colors';

// Mapping category ID → icon name + color
// Sync với web task_create_1.html (Material Symbols)
export const CATEGORY_ICONS = {
  1: { icon: 'book', name: 'Gia sư', color: COLORS.primary, bg: COLORS.primaryLight },
  2: { icon: 'happy', name: 'Đón trẻ', color: COLORS.primary, bg: COLORS.primaryLight },
  3: { icon: 'sparkles', name: 'Dọn dẹp', color: COLORS.primary, bg: COLORS.primaryLight },
  4: { icon: 'people', name: 'Trông trẻ', color: COLORS.primary, bg: COLORS.primaryLight },
  5: { icon: 'bag', name: 'Mua sắm hộ', color: COLORS.primary, bg: COLORS.primaryLight },
  6: { icon: 'restaurant', name: 'Nấu ăn', color: COLORS.primary, bg: COLORS.primaryLight },
  7: { icon: 'cube', name: 'Chuyển đồ', color: COLORS.primary, bg: COLORS.primaryLight },
  8: { icon: 'apps', name: 'Khác', color: COLORS.primary, bg: COLORS.primaryLight },
};

// Helper render icon cho category
export function renderCategoryIcon(categoryId, size = 28, color = null) {
  const cat = CATEGORY_ICONS[categoryId] || CATEGORY_ICONS[8];
  const iconColor = color || cat.color;
  return (
    <Ionicons
      name={cat.icon}
      size={size}
      color={iconColor}
    />
  );
}

// Helper lấy icon name theo category name (Vietnamese)
export function getCategoryIconByName(categoryName) {
  const name = (categoryName || '').toLowerCase();
  // Fix M13: thêm parentheses cho `(gia && s)` — trước đây `&&` có precedence
  // cao hơn `||` nên logic đúng, nhưng rõ ràng hơn khi có parentheses để tránh
  // nhầm lẫn khi maintain sau này.
  if ((name.includes('gia') && name.includes('s')) || name.includes('tutor')) return 'book';
  if (name.includes('đón') || name.includes('don') || name.includes('pickup')) return 'happy';
  if (name.includes('dọn') || name.includes('don') || name.includes('clean')) return 'sparkles';
  if (name.includes('trông') || name.includes('trong') || name.includes('baby')) return 'people';
  if (name.includes('mua') || name.includes('shop')) return 'bag';
  if (name.includes('nấu') || name.includes('nau') || name.includes('cook')) return 'restaurant';
  if (name.includes('chuyển') || name.includes('chuyen') || name.includes('mov')) return 'cube';
  return 'apps';
}
