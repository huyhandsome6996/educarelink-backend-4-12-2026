import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMyJobsAsWorker } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';

const TABS = [
  { key: 'pending',  label: 'Chờ duyệt', icon: 'time-outline' },
  { key: 'accepted', label: 'Sắp làm', icon: 'checkmark-circle-outline' },
  { key: 'rejected', label: 'Lịch sử', icon: 'archive-outline' },
];

const STATUS_STYLE = {
  pending:  { color: COLORS.warning, bg: COLORS.warningBg, label: 'Chờ duyệt', icon: 'time' },
  accepted: { color: COLORS.info, bg: COLORS.infoBg, label: 'Đã nhận', icon: 'checkmark-circle' },
  rejected: { color: COLORS.textMuted, bg: '#f3f4f6', label: 'Bị từ chối', icon: 'close-circle' },
};

export default function MyJobsScreen() {
  const [applications, setApplications] = useState([]);
  const [activeTab, setActiveTab] = useState('accepted');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = async () => {
    try {
      const res = await getMyJobsAsWorker();
      setApplications(res.data);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchJobs(); }, []);

  const filtered = applications.filter(a => {
    if (activeTab === 'rejected') return ['rejected', 'completed'].includes(a.status);
    return a.status === activeTab;
  });

  const totalEarned = applications
    .filter(a => a.status === 'accepted')
    .reduce((sum, a) => sum + parseFloat(a.task_price || 0), 0);

  const renderItem = ({ item: app }) => {
    const st = STATUS_STYLE[app.status] || STATUS_STYLE.rejected;
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={[styles.statusIcon, { backgroundColor: st.bg }]}>
            <Ionicons name={st.icon} size={20} color={st.color} />
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardTop}>
              <View style={[styles.badge, { backgroundColor: st.bg }]}>
                <View style={[styles.badgeDot, { backgroundColor: st.color }]} />
                <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
              </View>
              <Text style={styles.price}>
                {parseInt(app.task_price || 0).toLocaleString('vi-VN')}đ
              </Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>{app.task_title}</Text>
            <View style={styles.meta}>
              <Ionicons name="time-outline" size={13} color={COLORS.textMuted} />
              <Text style={styles.metaText}>
                {app.task_scheduled_time ? new Date(app.task_scheduled_time).toLocaleString('vi-VN') : 'Chưa có'}
              </Text>
            </View>
            <View style={styles.meta}>
              <Ionicons name="location-outline" size={13} color={COLORS.textMuted} />
              <Text style={styles.metaText}>{app.task_location || 'Không có địa điểm'}</Text>
            </View>
          </View>
        </View>
        {/* Thông tin phụ huynh */}
        {app.parent_username && (
          <View style={styles.parentCard}>
            <View style={styles.parentAvatar}>
              <Text style={styles.parentAvatarText}>{app.parent_username?.[0]?.toUpperCase() || 'P'}</Text>
            </View>
            <View>
              <Text style={styles.parentLabel}>Phụ huynh</Text>
              <Text style={styles.parentName}>{app.parent_username}</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Việc của tôi</Text>
        {totalEarned > 0 && (
          <View style={styles.earningsBadge}>
            <Ionicons name="wallet-outline" size={14} color={COLORS.success} />
            <Text style={styles.earningsText}>{totalEarned.toLocaleString('vi-VN')}đ</Text>
          </View>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.8}
            >
              <Ionicons name={tab.icon} size={16} color={isActive ? COLORS.primary : COLORS.textMuted} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList data={filtered} keyExtractor={i => i.id.toString()} renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchJobs(); }} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="document-outline" size={36} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>Không có việc nào</Text>
              <Text style={styles.emptyText}>Hãy ứng tuyển công việc từ bảng tin!</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, backgroundColor: COLORS.surface,
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: COLORS.textPrimary },
  earningsBadge: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: COLORS.successBg, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: '#bbf7d0',
  },
  earningsText: { fontSize: 13, fontWeight: '800', color: COLORS.success },
  tabs: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    paddingHorizontal: 16, paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    gap: 4,
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: 'transparent',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  tabActive: { borderBottomColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary, fontWeight: '800' },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 14, gap: 10,
    ...SHADOWS.small,
  },
  cardRow: { flexDirection: 'row', gap: 12 },
  statusIcon: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  cardContent: { flex: 1, gap: 5 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  price: { fontSize: 16, fontWeight: '900', color: COLORS.primary },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  meta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  metaText: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  parentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusSm,
    padding: 10,
  },
  parentAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
  },
  parentAvatarText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  parentLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  parentName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  emptyText: { color: COLORS.textMuted, fontSize: 13 },
});
