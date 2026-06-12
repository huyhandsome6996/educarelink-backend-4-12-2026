import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert, Platform, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { updateCertificate } from '../../api/auth';
import { COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS } from '../../theme/colors';

export default function WorkerProfileScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation();
  const [isUploading, setIsUploading] = React.useState(false);

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.username || 'Sinh viên';

  const MENU_ITEMS = [
    { icon: 'star-outline', label: 'Xem đánh giá từ phụ huynh', color: COLORS.primary, action: 'view_reviews' },
    { icon: 'card-outline', label: 'Xác thực thẻ sinh viên / bằng cấp', color: COLORS.primary, action: 'upload_cert' },
    { icon: 'shield-checkmark-outline', label: 'Chính sách bảo mật', color: COLORS.primary },
    { icon: 'help-circle-outline', label: 'Trung tâm hỗ trợ', color: COLORS.textSecondary },
  ];

  const handleMenuPress = async (action) => {
    if (action === 'view_reviews') {
      navigation.navigate('CandidateProfile', { workerId: user.id, isPending: false });
    } else if (action === 'upload_cert') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền truy cập bị từ chối', 'Ứng dụng cần quyền truy cập thư viện ảnh để tải lên.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled) {
        setIsUploading(true);
        try {
          const photo = {
            uri: result.assets[0].uri,
            type: result.assets[0].mimeType || 'image/jpeg',
            name: 'certificate.jpg',
          };
          await updateCertificate(photo);
          Alert.alert('Thành công', 'Đã tải lên minh chứng thành công. Admin sẽ xem xét sớm nhất!');
        } catch (error) {
          console.error("Upload error:", error?.response?.data || error);
          Alert.alert('Lỗi', 'Không thể tải lên. Vui lòng thử lại.');
        } finally {
          setIsUploading(false);
        }
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header cam */}
        <View style={styles.header}>
          {/* Decorative circles */}
          <View style={styles.headerDeco1} />
          <View style={styles.headerDeco2} />
          <View style={styles.headerDeco3} />
          <View style={styles.avatarRing}>
            <View style={styles.avatarGlow} />
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
              <Ionicons name="shield-outline" size={14} color={COLORS.warning} />
              <Text style={[styles.verifiedText, { color: COLORS.warning }]}>Chưa xác thực</Text>
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
                  <Text style={{ ...TYPO.body, color: COLORS.textPrimary }}>{q}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Menu Actions */}
        <View style={styles.section}>
          {MENU_ITEMS.map((item, index) => (
            <TouchableOpacity 
              key={item.label} 
              style={[styles.actionRow, index === MENU_ITEMS.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => item.action && handleMenuPress(item.action)}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: item.color + '15' }]}>
                {isUploading && item.action === 'upload_cert' ? (
                  <ActivityIndicator size="small" color={item.color} />
                ) : (
                  <Ionicons name={item.icon} size={20} color={item.color} />
                )}
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
    borderBottomLeftRadius: SIZES.radiusXl, borderBottomRightRadius: SIZES.radiusXl,
    overflow: 'hidden',
    position: 'relative',
  },
  headerDeco1: {
    position: 'absolute', top: -40, right: -30,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerDeco2: {
    position: 'absolute', bottom: -20, left: -30,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerDeco3: {
    position: 'absolute', top: 30, right: 90,
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  avatarRing: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
    position: 'relative',
  },
  avatarGlow: {
    position: 'absolute', top: -6, left: -6, right: -6, bottom: -6,
    borderRadius: 54,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  avatar: {
    width: 82, height: 82, borderRadius: 41,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', ...TYPO.h1, fontSize: 34 },
  name: { ...TYPO.h2, color: '#fff' },
  username: { ...TYPO.bodySmall, color: 'rgba(255,255,255,0.7)' },
  verifiedBadge: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: SIZES.radiusXl,
    paddingHorizontal: 14, paddingVertical: 6, marginTop: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  unverifiedBadge: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderColor: 'rgba(245,158,11,0.3)',
  },
  verifiedText: { ...TYPO.caption, color: '#fff' },
  // === AI ===
  aiCard: {
    margin: SIZES.md, backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusMd,
    padding: 16, gap: 10, borderWidth: 1, borderColor: COLORS.primarySoft,
    ...SHADOWS.small,
    borderLeftWidth: 3, borderLeftColor: COLORS.primary,
  },
  aiHeader: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  aiIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  aiImage: { width: '100%', height: '100%' },
  aiTitle: { ...TYPO.h5, color: COLORS.primary },
  aiText: { ...TYPO.body, color: COLORS.textSecondary },
  // === SECTIONS ===
  section: {
    margin: SIZES.md, marginTop: 0, marginBottom: 12,
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    overflow: 'hidden',
    ...SHADOWS.cardHover,
  },
  sectionTitle: {
    ...TYPO.overline, color: COLORS.textMuted,
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
  infoLabel: { ...TYPO.overline, color: COLORS.textMuted, marginBottom: 2 },
  infoValue: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '600' },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  actionIconCircle: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
  },
  actionText: { flex: 1, ...TYPO.bodyLarge, color: COLORS.textPrimary },
  logoutRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
    backgroundColor: COLORS.errorBg + '40',
    borderRadius: SIZES.radiusMd,
    margin: SIZES.xs,
    ...SHADOWS.small,
  },
});
