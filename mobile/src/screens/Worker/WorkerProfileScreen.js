import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';

export default function WorkerProfileScreen() {
  const { user, logout } = useAuth();

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.username || 'Sinh viên';

  const MENU_ITEMS = [
    { icon: 'star-outline', label: 'Xem đánh giá từ phụ huynh', color: COLORS.primary },
    { icon: 'card-outline', label: 'Xác thực thẻ sinh viên', color: COLORS.primary },
    { icon: 'shield-checkmark-outline', label: 'Chính sách bảo mật', color: COLORS.primary },
    { icon: 'help-circle-outline', label: 'Trung tâm hỗ trợ', color: COLORS.textSecondary },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header cam */}
        <View style={styles.header}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{displayName?.[0]?.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.username}>@{user?.username}</Text>
          {/* Verified badge */}
          {user?.is_verified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#fff" />
              <Text style={styles.verifiedText}>Đã xác thực</Text>
            </View>
          ) : (
            <View style={[styles.verifiedBadge, styles.unverifiedBadge]}>
              <Ionicons name="shield-outline" size={14} color={COLORS.warningBg} />
              <Text style={[styles.verifiedText, { color: COLORS.warningBg }]}>Chưa xác thực</Text>
            </View>
          )}
        </View>

        {/* AI Summary */}
        {user?.ai_profile_summary && (
          <View style={styles.aiCard}>
            <View style={styles.aiHeader}>
              <View style={styles.aiIconCircle}>
                <Image source={require('../../../assets/images/icon_ai_bot.png')} style={styles.aiImage} resizeMode="contain" />
              </View>
              <Text style={styles.aiTitle}>Nhận xét từ AI</Text>
            </View>
            <Text style={styles.aiText}>{user.ai_profile_summary}</Text>
          </View>
        )}

        {/* Thông tin */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Thông tin cá nhân</Text>
          <View style={styles.infoList}>
            {[
              { icon: 'mail-outline', label: 'Email', value: user?.email || 'Chưa cập nhật', color: COLORS.primary },
              { icon: 'call-outline', label: 'Số điện thoại', value: user?.phone_number || 'Chưa cập nhật', color: COLORS.primary },
              { icon: 'location-outline', label: 'Địa chỉ', value: user?.address || 'Chưa cập nhật', color: COLORS.primary },
            ].map(item => (
              <View key={item.label} style={styles.infoItem}>
                <View style={[styles.infoIconCircle, { backgroundColor: item.color + '15' }]}>
                  <Ionicons name={item.icon} size={18} color={item.color} />
                </View>
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>{item.label}</Text>
                  <Text style={styles.infoValue}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Bằng cấp & Chứng chỉ */}
        {user?.qualifications && user.qualifications.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bằng cấp & Chứng chỉ</Text>
            <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
              {user.qualifications.map((q, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="ribbon-outline" size={18} color={COLORS.primary} />
                  <Text style={{ fontSize: 14, color: COLORS.textPrimary, fontWeight: '500' }}>{q}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Menu Actions */}
        <View style={styles.section}>
          {MENU_ITEMS.map((item, index) => (
            <TouchableOpacity key={item.label} style={[styles.actionRow, index === MENU_ITEMS.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={[styles.actionIconCircle, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={styles.actionText}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutRow}
            onPress={() => {
              if (Platform.OS === 'web') {
                if (window.confirm('Bạn có chắc chắn muốn đăng xuất?')) {
                  logout();
                }
              } else {
                Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', [
                  { text: 'Huỷ', style: 'cancel' },
                  { text: 'Đăng xuất', style: 'destructive', onPress: logout }
                ]);
              }
            }}>
            <View style={[styles.actionIconCircle, { backgroundColor: COLORS.errorBg }]}>
              <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
            </View>
            <Text style={[styles.actionText, { color: COLORS.error }]}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  // === HEADER ===
  header: {
    alignItems: 'center', paddingTop: 56, paddingBottom: 32,
    backgroundColor: COLORS.primary, gap: 6,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
  },
  avatarRing: {
    width: 92, height: 92, borderRadius: 46,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 34, fontWeight: '900' },
  name: { fontSize: 22, fontWeight: '900', color: '#fff' },
  username: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  verifiedBadge: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6, marginTop: 4,
  },
  unverifiedBadge: { backgroundColor: 'rgba(245,158,11,0.3)' },
  verifiedText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  // === AI ===
  aiCard: {
    margin: 16, backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusMd,
    padding: 16, gap: 10, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  aiHeader: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  aiIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },
  aiImage: { width: '100%', height: '100%' },
  aiTitle: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  aiText: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  // === SECTIONS ===
  section: {
    margin: 16, marginTop: 0, marginBottom: 12,
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '800', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    padding: 16, paddingBottom: 8,
  },
  infoList: { paddingHorizontal: 16, paddingBottom: 8 },
  infoItem: {
    flexDirection: 'row', gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center',
  },
  infoIconCircle: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
  },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  infoValue: { fontSize: 14, color: COLORS.textPrimary, fontWeight: '600' },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  actionIconCircle: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
  },
  actionText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  logoutRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
  },
});
