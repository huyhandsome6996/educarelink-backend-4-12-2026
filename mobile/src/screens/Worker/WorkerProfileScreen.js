import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

export default function WorkerProfileScreen() {
  const { user, logout } = useAuth();

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.username || 'Sinh viên';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{displayName?.[0]?.toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.username}>@{user?.username}</Text>
          {/* Verified badge */}
          {user?.is_verified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#059669" />
              <Text style={styles.verifiedText}>Đã xác thực</Text>
            </View>
          ) : (
            <View style={[styles.verifiedBadge, styles.unverifiedBadge]}>
              <Ionicons name="shield-outline" size={14} color="#f59e0b" />
              <Text style={[styles.verifiedText, { color: '#f59e0b' }]}>Chưa xác thực</Text>
            </View>
          )}
        </View>

        {/* AI Summary */}
        {user?.ai_profile_summary && (
          <View style={styles.aiCard}>
            <View style={styles.aiHeader}>
              <Text style={styles.aiIcon}>🤖</Text>
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
              { icon: 'mail-outline', label: 'Email', value: user?.email || 'Chưa cập nhật' },
              { icon: 'call-outline', label: 'Số điện thoại', value: user?.phone_number || 'Chưa cập nhật' },
              { icon: 'location-outline', label: 'Địa chỉ', value: user?.address || 'Chưa cập nhật' },
            ].map(item => (
              <View key={item.label} style={styles.infoItem}>
                <Ionicons name={item.icon} size={18} color="#6b7280" />
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>{item.label}</Text>
                  <Text style={styles.infoValue}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow}>
            <Ionicons name="star-outline" size={20} color="#0d9488" />
            <Text style={styles.actionText}>Xem đánh giá từ phụ huynh</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionRow}>
            <Ionicons name="card-outline" size={20} color="#0051d5" />
            <Text style={styles.actionText}>Xác thực thẻ sinh viên</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionRow, styles.logoutRow]}
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
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            <Text style={[styles.actionText, { color: '#ef4444' }]}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { alignItems: 'center', paddingTop: 56, paddingBottom: 32, backgroundColor: '#fff', gap: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#0d9488', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  name: { fontSize: 22, fontWeight: '800', color: '#111827' },
  username: { fontSize: 14, color: '#6b7280' },
  verifiedBadge: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: '#bbf7d0' },
  unverifiedBadge: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  verifiedText: { fontSize: 13, fontWeight: '700', color: '#059669' },
  aiCard: { margin: 16, backgroundColor: '#eff6ff', borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: '#bfdbfe' },
  aiHeader: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  aiIcon: { fontSize: 18 },
  aiTitle: { fontSize: 14, fontWeight: '700', color: '#0051d5' },
  aiText: { fontSize: 14, color: '#374151', lineHeight: 22 },
  section: { margin: 16, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, padding: 16, paddingBottom: 8 },
  infoList: { paddingHorizontal: 16, paddingBottom: 8 },
  infoItem: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', alignItems: 'flex-start' },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  infoValue: { fontSize: 14, color: '#111827', fontWeight: '600' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  actionText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  logoutRow: { borderBottomWidth: 0 },
});
