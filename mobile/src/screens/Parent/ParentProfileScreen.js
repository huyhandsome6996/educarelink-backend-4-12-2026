// ============================================================
// ParentProfileScreen — MỚI (Nhóm B, mock data)
// Hồ sơ cá nhân của phụ huynh + menu cài đặt.
// Dùng dữ liệu thật từ useAuth() cho phần profile, mock cho phần còn lại.
//
// Layout theo design HTML parent_profile/code.html:
// - Top App Bar: surface bg, avatar nhỏ + 'EduCareLink' + bell
// - Profile card: surface bg, avatar 96px + name h2 + role +
//   2 badges (Đã xác thực + Thành viên)
// - Stats row: 3 cột (việc đã đăng /已完成 / đánh giá)
// - Menu list: surface card với các rows (icon circle + label + chevron)
//   * Thông tin cá nhân
//   * Điểm thưởng & Voucher
//   * Quản lý bé
//   * Phương thức thanh toán
//   * Thông báo
//   * Bảo mật & Quyền riêng tư
//   * Trợ giúp & Hỗ trợ
// - Logout button (text màu errorDeep)
// ============================================================

import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Alert, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import { showComingSoon } from '../../utils/comingSoon';

// Menu items — những mục chưa có screen → showComingSoon
const MENU_ITEMS = [
  { id: 'personal', icon: 'person', label: 'Thông tin cá nhân', target: null },
  { id: 'rewards', icon: 'gift', label: 'Điểm thưởng & Voucher', target: 'RewardPoints' },
  { id: 'children', icon: 'people', label: 'Quản lý bé', target: null },
  { id: 'payment', icon: 'card', label: 'Phương thức thanh toán', target: 'PaymentSetup' },
  { id: 'notifications', icon: 'notifications', label: 'Cài đặt thông báo', target: 'Notifications' },
  { id: 'security', icon: 'shield-lock', label: 'Bảo mật & Quyền riêng tư', target: null },
  { id: 'help', icon: 'help-circle', label: 'Trợ giúp & Hỗ trợ', target: 'HelpCenter' },
  { id: 'about', icon: 'information-circle', label: 'Về EduCareLink', target: null },
];

export default function ParentProfileScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.username || 'Phụ huynh';

  const handleMenuPress = (item) => {
    if (item.target) {
      navigation.navigate(item.target);
    } else {
      showComingSoon(item.label);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Bạn có chắc chắn muốn đăng xuất?')) {
        logout();
      }
    } else {
      Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Đăng xuất', style: 'destructive', onPress: logout },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* Top App Bar */}
      <View style={styles.appBar}>
        <View style={styles.avatarSmall}>
          <Ionicons name="person" size={18} color={COLORS.primary} />
        </View>
        <Text style={styles.appBarTitle}>EduCareLink</Text>
        <TouchableOpacity
          style={styles.appBarBtn}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Ionicons name="notifications-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          {/* Avatar 96px */}
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarText}>{displayName[0]?.toUpperCase() || '?'}</Text>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.role}>Phụ huynh</Text>

          {/* Badges */}
          <View style={styles.badgeRow}>
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={14} color={COLORS.secondaryDark} />
              <Text style={styles.verifiedBadgeText}>Đã xác thực</Text>
            </View>
            <View style={styles.memberBadge}>
              <Ionicons name="star" size={14} color={COLORS.onSurfaceVariant} />
              <Text style={styles.memberBadgeText}>Thành viên</Text>
            </View>
          </View>
        </View>

        {/* Stats row — 3 cột */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>12</Text>
            <Text style={styles.statLabel}>Việc đã đăng</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>8</Text>
            <Text style={styles.statLabel}>Hoàn thành</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>4.8</Text>
            <Text style={styles.statLabel}>Đánh giá</Text>
          </View>
        </View>

        {/* Menu list */}
        <View style={styles.menuCard}>
          {MENU_ITEMS.map((item, idx) => (
            <View key={item.id}>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => handleMenuPress(item)}
                activeOpacity={0.7}
              >
                <View style={styles.menuIconBox}>
                  <Ionicons name={item.icon} size={20} color={COLORS.primary} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={COLORS.onSurfaceVariant} />
              </TouchableOpacity>
              {idx < MENU_ITEMS.length - 1 && <View style={styles.menuDivider} />}
            </View>
          ))}
        </View>

        {/* Become CarePartner CTA — chỉ hiện nếu user là parent */}
        {user?.role === 'parent' && !user?.is_staff && (
          <TouchableOpacity
            style={styles.upgradeCard}
            onPress={() => navigation.navigate('UpgradeToCarepartner')}
            activeOpacity={0.85}
          >
            <View style={styles.upgradeIconBox}>
              <Ionicons name="school" size={24} color={COLORS.secondaryDark} />
            </View>
            <View style={styles.upgradeContent}>
              <Text style={styles.upgradeTitle}>Trở thành CarePartner</Text>
              <Text style={styles.upgradeDesc}>Kiếm thêm thu nhập linh hoạt</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={COLORS.secondaryDark} />
          </TouchableOpacity>
        )}

        {/* Logout button */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.errorDeep} />
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </TouchableOpacity>

        {/* App version */}
        <Text style={styles.versionText}>EduCareLink v1.0.0</Text>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  // === APP BAR ===
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: COLORS.surface,
  },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 2,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  appBarTitle: {
    ...TYPO.h1,
    color: COLORS.primary,
    fontSize: 22,
  },
  appBarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // === SCROLL ===
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 20 },
  // === PROFILE CARD ===
  profileCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
  },
  avatarLarge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primary,
    borderWidth: 4,
    borderColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...SHADOWS.medium,
  },
  avatarText: {
    ...TYPO.h1,
    color: '#fff',
    fontSize: 36,
  },
  name: {
    ...TYPO.h2,
    color: COLORS.onSurface,
    marginBottom: 4,
  },
  role: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
    marginBottom: 16,
  },
  // === BADGES ===
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.secondaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  verifiedBadgeText: {
    ...TYPO.caption,
    color: COLORS.secondaryDark,
    fontWeight: '700',
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceContainerHigh,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  memberBadgeText: {
    ...TYPO.caption,
    color: COLORS.onSurface,
    fontWeight: '700',
  },
  // === STATS CARD ===
  statsCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...TYPO.h3,
    color: COLORS.primary,
    marginBottom: 4,
  },
  statLabel: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.outlineVariant,
  },
  // === MENU CARD ===
  menuCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
  },
  menuIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: {
    ...TYPO.h4,
    color: COLORS.onSurface,
    flex: 1,
  },
  menuDivider: {
    height: 1,
    backgroundColor: COLORS.outlineVariant,
    marginHorizontal: 16,
    opacity: 0.5,
  },
  // === UPGRADE CTA ===
  upgradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.secondaryLight,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.secondary,
    ...SHADOWS.small,
  },
  upgradeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  upgradeContent: { flex: 1 },
  upgradeTitle: {
    ...TYPO.h4,
    color: COLORS.secondaryDark,
    marginBottom: 2,
  },
  upgradeDesc: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
  },
  // === LOGOUT ===
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(186, 26, 26, 0.3)',
    ...SHADOWS.small,
  },
  logoutText: {
    ...TYPO.h4,
    color: COLORS.errorDeep,
  },
  // === VERSION ===
  versionText: {
    ...TYPO.caption,
    color: COLORS.outline,
    textAlign: 'center',
    marginTop: 8,
  },
});
