import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Alert, ScrollView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  getPendingWorkers, workerAction, toggleUserActive, revokeCarepartner,
  getAllWorkers, getAllUsers, seedDemoData,
} from '../../api/admin';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import NotificationBell from '../../components/NotificationBell';

const TABS = [
  { key: 'pending', label: 'Chờ duyệt', icon: 'time-outline' },
  { key: 'workers', label: 'Carepartner', icon: 'people-outline' },
  { key: 'users',   label: 'Tất cả user', icon: 'person-outline' },
];

export default function AdminDashboardScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('pending');
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchData = async () => {
    try {
      let res;
      if (activeTab === 'pending') res = await getPendingWorkers();
      else if (activeTab === 'workers') res = await getAllWorkers();
      else res = await getAllUsers();
      setData(res.data || []);
    } catch (e) {
      console.error('Admin fetch error:', e);
      Alert.alert('Lỗi', 'Không thể tải dữ liệu.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, [activeTab]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [activeTab]);

  const handleAction = async (userId, action) => {
    setActionLoading(`${userId}-${action}`);
    try {
      if (action === 'approve') {
        await workerAction(userId, { action: 'approve' });
        Alert.alert('✅ Đã duyệt', 'Tài khoản Carepartner đã được kích hoạt.');
      } else if (action === 'reject') {
        Alert.alert(
          'Xác nhận từ chối',
          'Bạn chắc chắn muốn từ chối tài khoản này?',
          [
            { text: 'Huỷ', style: 'cancel' },
            {
              text: 'Từ chối', style: 'destructive', onPress: async () => {
                await workerAction(userId, { action: 'reject' });
                Alert.alert('✅ Đã từ chối', 'Tài khoản đã bị từ chối.');
                fetchData();
              }
            },
          ]
        );
        return;
      } else if (action === 'toggle_active') {
        await toggleUserActive(userId);
        Alert.alert('✅ Thành công', 'Đã thay đổi trạng thái tài khoản.');
      } else if (action === 'revoke') {
        Alert.alert(
          'Xác nhận tước quyền',
          'Tước quyền Carepartner (đổi về Phụ huynh)?',
          [
            { text: 'Huỷ', style: 'cancel' },
            {
              text: 'Tước quyền', style: 'destructive', onPress: async () => {
                await revokeCarepartner(userId);
                Alert.alert('✅ Đã tước quyền', 'User đã được đổi về vai trò Phụ huynh.');
                fetchData();
              }
            },
          ]
        );
        return;
      }
      fetchData();
    } catch (e) {
      const msg = e.response?.data?.error || 'Thao tác thất bại.';
      Alert.alert('Lỗi', msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSeedDemo = async () => {
    Alert.alert(
      'Seed dữ liệu mẫu',
      'Tạo user + task mẫu để test? (Sẽ thêm dữ liệu vào DB)',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Tạo dữ liệu', onPress: async () => {
            try {
              await seedDemoData();
              Alert.alert('✅ Thành công', 'Đã seed dữ liệu mẫu.');
              fetchData();
            } catch (e) {
              Alert.alert('Lỗi', 'Không thể seed dữ liệu.');
            }
          }
        },
      ]
    );
  };

  const renderUser = ({ item }) => {
    const isWorker = item.role === 'worker';
    const isPending = !item.is_approved && isWorker;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.username?.[0]?.toUpperCase() || '?'}</Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.userName}>
              {item.first_name || item.last_name ? `${item.first_name} ${item.last_name || ''}`.trim() : item.username}
            </Text>
            <Text style={styles.userUsername}>@{item.username}</Text>
            <View style={styles.roleRow}>
              <View style={[styles.roleBadge, isWorker ? styles.roleWorker : (item.role === 'parent' ? styles.roleParent : styles.roleAdmin)]}>
                <Text style={styles.roleText}>{item.role === 'parent' ? 'Phụ huynh' : (item.role === 'worker' ? 'Carepartner' : 'Admin')}</Text>
              </View>
              {!item.is_active && (
                <View style={styles.lockedBadge}>
                  <Ionicons name="lock-closed" size={10} color="#fff" />
                  <Text style={styles.lockedText}>Khoá</Text>
                </View>
              )}
              {isPending && (
                <View style={styles.pendingBadge}>
                  <Ionicons name="time" size={10} color={COLORS.warning} />
                  <Text style={styles.pendingText}>Chờ duyệt</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Contact info */}
        <View style={styles.contactRow}>
          {item.email ? (
            <View style={styles.contactItem}>
              <Ionicons name="mail-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.contactText}>{item.email}</Text>
            </View>
          ) : null}
          {item.phone_number ? (
            <View style={styles.contactItem}>
              <Ionicons name="call-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.contactText}>{item.phone_number}</Text>
            </View>
          ) : null}
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          {activeTab === 'pending' && (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn, actionLoading === `${item.id}-approve` && { opacity: 0.6 }]}
                onPress={() => handleAction(item.id, 'approve')}
                disabled={actionLoading === `${item.id}-approve`}
                activeOpacity={0.85}
              >
                {actionLoading === `${item.id}-approve` ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>Duyệt</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => handleAction(item.id, 'reject')}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={16} color={COLORS.error} />
                <Text style={[styles.actionBtnText, { color: COLORS.error }]}>Từ chối</Text>
              </TouchableOpacity>
            </>
          )}
          {activeTab === 'workers' && (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.toggleBtn]}
                onPress={() => handleAction(item.id, 'toggle_active')}
                activeOpacity={0.85}
              >
                <Ionicons name={item.is_active ? 'lock-closed-outline' : 'lock-open-outline'} size={16} color={COLORS.textSecondary} />
                <Text style={[styles.actionBtnText, { color: COLORS.textSecondary }]}>
                  {item.is_active ? 'Khoá' : 'Mở khoá'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.revokeBtn]}
                onPress={() => handleAction(item.id, 'revoke')}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-swap" size={16} color={COLORS.warning} />
                <Text style={[styles.actionBtnText, { color: COLORS.warning }]}>Tước quyền</Text>
              </TouchableOpacity>
            </>
          )}
          {activeTab === 'users' && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.toggleBtn]}
              onPress={() => handleAction(item.id, 'toggle_active')}
              activeOpacity={0.85}
            >
              <Ionicons name={item.is_active ? 'lock-closed-outline' : 'lock-open-outline'} size={16} color={COLORS.textSecondary} />
              <Text style={[styles.actionBtnText, { color: COLORS.textSecondary }]}>
                {item.is_active ? 'Khoá tài khoản' : 'Mở khoá'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const listHeaderComponent = React.useMemo(() => (
    <Text style={styles.countText}>{data.length} {activeTab === 'pending' ? 'chờ duyệt' : (activeTab === 'workers' ? 'carepartner' : 'người dùng')}</Text>
  ), [data.length, activeTab]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <NotificationBell color="#fff" />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => { setActiveTab(tab.key); setIsLoading(true); }}
              activeOpacity={0.8}
            >
              <Ionicons name={tab.icon} size={16} color={isActive ? COLORS.primary : COLORS.textMuted} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={i => i.id.toString()}
          renderItem={renderUser}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListHeaderComponent={listHeaderComponent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="checkmark-done-outline" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>Không có dữ liệu</Text>
              <Text style={styles.emptyText}>
                {activeTab === 'pending' ? 'Không có carepartner nào chờ duyệt' : 'Chưa có user nào'}
              </Text>
            </View>
          }
        />
      )}

      {/* Bottom: Seed demo data button */}
      <TouchableOpacity style={styles.seedBtn} onPress={handleSeedDemo} activeOpacity={0.85}>
        <Ionicons name="flask-outline" size={18} color="#fff" />
        <Text style={styles.seedBtnText}>Tạo dữ liệu mẫu</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SIZES.md, paddingTop: 56, paddingBottom: 16,
    backgroundColor: COLORS.primary,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: SIZES.radiusSm,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { ...TYPO.h4, color: '#fff', fontWeight: '800', flex: 1, marginLeft: 12 },
  tabs: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    gap: SIZES.xs,
  },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderRadius: SIZES.radiusSm,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.background,
  },
  tabActive: { backgroundColor: COLORS.primaryLight, ...SHADOWS.small },
  tabText: { ...TYPO.buttonSmall, color: COLORS.textMuted, fontWeight: '600' },
  tabTextActive: { color: COLORS.primary, fontWeight: '800' },
  list: { padding: SIZES.md, gap: 12, paddingBottom: 100 },
  countText: { ...TYPO.overline, color: COLORS.textMuted, marginBottom: 4 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: 14, gap: 10,
    ...SHADOWS.cardHover, borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.small,
  },
  avatarText: { color: '#fff', ...TYPO.h4, fontWeight: '800' },
  cardInfo: { flex: 1, gap: 2 },
  userName: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  userUsername: { ...TYPO.caption, color: COLORS.textMuted },
  roleRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 2 },
  roleBadge: { borderRadius: SIZES.radiusXs, paddingHorizontal: 8, paddingVertical: 2 },
  roleWorker: { backgroundColor: COLORS.primaryLight },
  roleParent: { backgroundColor: COLORS.successBg },
  roleAdmin: { backgroundColor: '#fef3c7' },
  roleText: { ...TYPO.overline, fontWeight: '700' },
  lockedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.error, borderRadius: SIZES.radiusXs, paddingHorizontal: 6, paddingVertical: 2,
  },
  lockedText: { color: '#fff', ...TYPO.overline, fontSize: 9, fontWeight: '700' },
  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.warningBg, borderRadius: SIZES.radiusXs, paddingHorizontal: 6, paddingVertical: 2,
  },
  pendingText: { ...TYPO.overline, color: COLORS.warning, fontSize: 9, fontWeight: '700' },
  contactRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contactText: { ...TYPO.caption, color: COLORS.textSecondary },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    borderRadius: SIZES.radiusSm, paddingVertical: 10,
  },
  approveBtn: { backgroundColor: COLORS.success, ...SHADOWS.small },
  rejectBtn: { backgroundColor: COLORS.errorBg, borderWidth: 1, borderColor: '#fecaca' },
  toggleBtn: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  revokeBtn: { backgroundColor: COLORS.warningBg, borderWidth: 1, borderColor: '#fde68a' },
  actionBtnText: { ...TYPO.buttonSmall, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyIconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.small,
  },
  emptyTitle: { ...TYPO.h5, color: COLORS.textPrimary },
  emptyText: { ...TYPO.bodySmall, color: COLORS.textMuted, textAlign: 'center' },
  seedBtn: {
    position: 'absolute', bottom: 20, left: 20, right: 20,
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 50,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
    ...SHADOWS.large,
  },
  seedBtnText: { color: '#fff', ...TYPO.button, fontSize: 15 },
});
