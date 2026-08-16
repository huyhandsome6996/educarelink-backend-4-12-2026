import React, { useRef, useEffect, useState } from 'react';
// ============================================================
// ParentProfileScreen — MỚI (Nhóm B)
// Hồ sơ cá nhân của phụ huynh + menu cài đặt.
// Dùng dữ liệu thật từ useAuth() (được populate từ API GET /profile/)
// cho phần thông tin cá nhân + nút "Yêu cầu sửa hồ sơ" gọi requestProfileChange.
// Phần thống kê (số việc đã đăng/hoàn thành/đánh giá) dùng mock
// vì chưa có API stats cho parent — sẽ nối khi backend có endpoint.
//
// Layout theo design HTML parent_profile/code.html:
// - Top App Bar: surface bg, avatar nhỏ + 'EduCareLink' + bell
// - Profile card: surface bg, avatar 96px + name h2 + role +
//   2 badges (Đã xác thực + Thành viên)
// - Stats row: 3 cột (việc đã đăng / hoàn thành / đánh giá)
// - Info section: email/phone/address rows (real data từ useAuth)
// - Menu list: surface card với các rows (icon circle + label + chevron)
// - Logout button (text màu errorDeep)
// ============================================================

import {View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert, Platform, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Animated} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { requestProfileChange } from '../../api/tasks';
import {COLORS, SHADOWS, SIZES, TYPO, ANIM} from '../../theme/colors';
import { showComingSoon } from '../../utils/comingSoon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Menu items — những mục chưa có screen → showComingSoon
const MENU_ITEMS = [
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

  // QA-FIX-UI 3.2: fade-in animation khi mount (opacity 0→1)
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIM.timingNormal,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  // Modal state cho "Yêu cầu sửa hồ sơ" — pattern giống WorkerProfileScreen
  const [changeModalVisible, setChangeModalVisible] = React.useState(false);
  const [changeForm, setChangeForm] = React.useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone_number: user?.phone_number || '',
    email: user?.email || '',
    address: user?.address || '',
  });
  const [changeSubmitting, setChangeSubmitting] = React.useState(false);

  // Sync form khi user thay đổi (vd: user load xong sau khi mount)
  React.useEffect(() => {
    if (user) {
      setChangeForm({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        phone_number: user.phone_number || '',
        email: user.email || '',
        address: user.address || '',
      });
    }
  }, [user]);

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

  const handleRequestChange = async () => {
    setChangeSubmitting(true);
    try {
      const changes = {};
      Object.keys(changeForm).forEach(key => {
        const newVal = (changeForm[key] || '').trim();
        const oldVal = (user?.[key] || '').trim();
        if (newVal && newVal !== oldVal) changes[key] = newVal;
      });
      if (Object.keys(changes).length === 0) {
        Alert.alert('Không có thay đổi', 'Bạn chưa sửa thông tin nào.');
        setChangeSubmitting(false);
        return;
      }
      await requestProfileChange(changes);
      Alert.alert('✅ Đã gửi', 'Yêu cầu thay đổi hồ sơ đã gửi. Admin sẽ duyệt trong 1-2 ngày.');
      setChangeModalVisible(false);
    } catch (e) {
      const msg = e.response?.data?.error || 'Gửi yêu cầu thất bại.';
      Alert.alert('Lỗi', typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setChangeSubmitting(false);
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
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* Top App Bar */}
      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
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
          <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail">{displayName}</Text>
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

        {/* Stats row — 3 cột (mock stats, chưa có API parent stats) */}
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

        {/* Thông tin cá nhân — real data từ useAuth() (được populate từ API GET /profile/) */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Text style={styles.infoTitle}>Thông tin cá nhân</Text>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => {
                setChangeForm({
                  first_name: user?.first_name || '',
                  last_name: user?.last_name || '',
                  phone_number: user?.phone_number || '',
                  email: user?.email || '',
                  address: user?.address || '',
                });
                setChangeModalVisible(true);
              }}
            >
              <Ionicons name="create-outline" size={16} color={COLORS.primary} />
              <Text style={styles.editBtnText}>Sửa</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.infoList}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIconBox, { backgroundColor: COLORS.primaryLight }]}>
                <Ionicons name="mail-outline" size={18} color={COLORS.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">{user?.email || 'Chưa cập nhật'}</Text>
              </View>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <View style={[styles.infoIconBox, { backgroundColor: COLORS.primaryLight }]}>
                <Ionicons name="call-outline" size={18} color={COLORS.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Số điện thoại</Text>
                <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">{user?.phone_number || 'Chưa cập nhật'}</Text>
              </View>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <View style={[styles.infoIconBox, { backgroundColor: COLORS.primaryLight }]}>
                <Ionicons name="location-outline" size={18} color={COLORS.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Địa chỉ</Text>
                <Text style={styles.infoValue} numberOfLines={2} ellipsizeMode="tail">
                  {user?.address || 'Chưa cập nhật'}
                </Text>
              </View>
            </View>
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
        <Text style={styles.versionText}>EduCareLink v1.1.0</Text>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Modal: Yêu cầu sửa hồ sơ — pattern giống WorkerProfileScreen */}
      <Modal visible={changeModalVisible} animationType="slide" transparent={true} onRequestClose={() => setChangeModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yêu cầu sửa hồ sơ</Text>
              <TouchableOpacity onPress={() => setChangeModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Họ</Text>
            <TextInput style={styles.modalInput} value={changeForm.last_name}
              onChangeText={(v) => setChangeForm({...changeForm, last_name: v})}
              placeholderTextColor={COLORS.textMuted} />

            <Text style={styles.modalLabel}>Tên</Text>
            <TextInput style={styles.modalInput} value={changeForm.first_name}
              onChangeText={(v) => setChangeForm({...changeForm, first_name: v})}
              placeholderTextColor={COLORS.textMuted} />

            <Text style={styles.modalLabel}>Số điện thoại</Text>
            <TextInput style={styles.modalInput} value={changeForm.phone_number}
              onChangeText={(v) => setChangeForm({...changeForm, phone_number: v})}
              keyboardType="phone-pad" placeholderTextColor={COLORS.textMuted} />

            <Text style={styles.modalLabel}>Email</Text>
            <TextInput style={styles.modalInput} value={changeForm.email}
              onChangeText={(v) => setChangeForm({...changeForm, email: v})}
              keyboardType="email-address" autoCapitalize="none"
              placeholderTextColor={COLORS.textMuted} />

            <Text style={styles.modalLabel}>Địa chỉ</Text>
            <TextInput style={styles.modalInput} value={changeForm.address}
              onChangeText={(v) => setChangeForm({...changeForm, address: v})}
              multiline placeholderTextColor={COLORS.textMuted} />

            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={14} color={COLORS.primary} />
              <Text style={styles.infoBoxText}>Yêu cầu sẽ được Admin duyệt trong 1-2 ngày. Bạn vẫn dùng thông tin cũ cho đến khi được duyệt.</Text>
            </View>

            <TouchableOpacity
              style={[styles.modalSubmitBtn, changeSubmitting && { opacity: 0.7 }]}
              onPress={handleRequestChange}
              disabled={changeSubmitting}
              activeOpacity={0.85}
            >
              {changeSubmitting ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.modalSubmitText}>Gửi yêu cầu</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Animated.View>
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
  // === INFO CARD (email/phone/address) ===
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: COLORS.primaryLight,
  },
  editBtnText: {
    ...TYPO.caption,
    color: COLORS.primary,
    fontWeight: '700',
  },
  infoList: { gap: 0 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  infoIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContent: { flex: 1 },
  infoLabel: {
    ...TYPO.overline,
    color: COLORS.onSurfaceVariant,
    marginBottom: 2,
  },
  infoValue: {
    ...TYPO.body,
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  infoDivider: {
    height: 1,
    backgroundColor: COLORS.outlineVariant,
    opacity: 0.5,
  },
  // === MODAL (Yêu cầu sửa hồ sơ) ===
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl,
    padding: 20, paddingBottom: 36, maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { ...TYPO.h4, color: COLORS.onSurface, fontWeight: '800' },
  modalCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.surfaceWarm, justifyContent: 'center', alignItems: 'center',
  },
  modalLabel: { ...TYPO.overline, color: COLORS.onSurfaceVariant, marginBottom: 6, marginTop: 12 },
  modalInput: {
    backgroundColor: COLORS.surfaceWarm, borderRadius: SIZES.radiusSm, borderWidth: 1.5,
    borderColor: COLORS.outlineVariant, paddingHorizontal: 14, paddingVertical: 10,
    ...TYPO.body, color: COLORS.onSurface,
  },
  infoBox: {
    flexDirection: 'row', gap: 6, alignItems: 'flex-start',
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusSm, padding: 10,
    marginTop: 12, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  infoBoxText: { flex: 1, ...TYPO.caption, color: COLORS.primaryDark, lineHeight: 18 },
  modalSubmitBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 50,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    marginTop: 20,
    ...SHADOWS.large,
  },
  modalSubmitText: { color: '#fff', ...TYPO.button, fontSize: 15 },
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
