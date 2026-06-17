import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMyJobsAsWorker } from '../../api/tasks';
import NotificationBell from '../../components/NotificationBell';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

const TABS = [
  { key: 'pending',  label: 'Chờ duyệt', icon: 'time-outline' },
  { key: 'accepted', label: 'Sắp làm', icon: 'checkmark-circle-outline' },
  { key: 'rejected', label: 'Lịch sử', icon: 'archive-outline' },
];

const STATUS_STYLE = {
  pending:  { color: COLORS.warning, bg: COLORS.warningBg, label: 'Chờ duyệt', icon: 'time' },
  accepted: { color: COLORS.primary, bg: COLORS.primaryLight, label: 'Đã nhận', icon: 'checkmark-circle' },
  rejected: { color: COLORS.textMuted, bg: '#f3f4f6', label: 'Bị từ chối', icon: 'close-circle' },
};

export default function MyJobsScreen() {
  const [applications, setApplications] = useState([]);
  const [activeTab, setActiveTab] = useState('accepted');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const bounceAnim = useRef(new Animated.Value(0)).current;

  const fetchJobs = async () => {
    try {
      const res = await getMyJobsAsWorker();
      setApplications(res.data);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchJobs(); }, []);

  // Empty state bounce animation
  useEffect(() => {
    if (!isLoading && applications.length === 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(bounceAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isLoading, applications.length]);

  const bounceTransform = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

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
        <View style={styles.headerRight}>
          <NotificationBell dark />
          {totalEarned > 0 && (
            <View style={styles.earningsBadge}>
              <Ionicons name="wallet-outline" size={14} color={COLORS.success} />
              <Text style={styles.earningsText}>{totalEarned.toLocaleString('vi-VN')}đ</Text>
            </View>
          )}
        </View>
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
              <Animated.View style={[styles.emptyIconCircle, { transform: [{ translateY: bounceTransform }] }]}>
                <Ionicons name="document-outline" size={36} color={COLORS.primary} />
              </Animated.View>
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
  headerTitle: { ...TYPO.h1, fontSize: 24, color: COLORS.textPrimary },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  earningsBadge: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: COLORS.successBg, borderRadius: SIZES.radiusXl,
    paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: '#bbf7d0',
    ...SHADOWS.small,
  },
  earningsText: { ...TYPO.buttonSmall, color: COLORS.success },
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
  tabActive: {
    backgroundColor: COLORS.primaryLight,
    ...SHADOWS.small,
  },
  tabText: { ...TYPO.buttonSmall, color: COLORS.textMuted, fontWeight: '600' },
  tabTextActive: { color: COLORS.primary, fontWeight: '800' },
  list: { padding: SIZES.md, gap: 12 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 14, gap: 10,
    ...SHADOWS.cardHover,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  cardRow: { flexDirection: 'row', gap: 12 },
  statusIcon: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  cardContent: { flex: 1, gap: 5 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    borderRadius: SIZES.radiusXs, paddingHorizontal: 8, paddingVertical: 3,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { ...TYPO.overline },
  price: { ...TYPO.h4, fontWeight: '900', color: COLORS.primary },
  title: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  meta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  metaText: { ...TYPO.bodySmall, color: COLORS.textSecondary, flex: 1 },
  parentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusSm,
    padding: 10,
    ...SHADOWS.small,
    borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  parentAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  parentAvatarText: { color: '#fff', ...TYPO.buttonSmall },
  parentLabel: { ...TYPO.overline, color: COLORS.textMuted, fontWeight: '600' },
  parentName: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  emptyTitle: { ...TYPO.h4, color: COLORS.textPrimary },
  emptyText: { ...TYPO.bodySmall, color: COLORS.textMuted },
});
