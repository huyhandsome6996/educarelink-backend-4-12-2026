// ============================================================
// TrackingOverviewScreen — Tab "Theo dõi" (QA-FIX-UI 1.2 Hướng A)
// Màn tổng hợp các task đang in_progress của phụ huynh, mỗi task có
// CTA "Theo dõi trực tiếp" → navigate sang LiveTracking với taskId.
// Empty state tử tế khi không có task nào đang diễn ra.
//
// Thiết kế theo Warm Professionalism:
// - Header: appBar trắng, back + title + bell (như các màn Parent khác)
// - Cards: surface warm bg, border outline-variant, accent primary-container
// - Empty state: icon radar + message + CTA tạo task
// - Fade-in animation khi mount (dùng ANIM.timingNormal preset)
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, FlatList, Animated, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getMyTasksAsParent } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO, ANIM } from '../../theme/colors';
import NotificationBell from '../../components/NotificationBell';

// Map status → label/icon (sync với MyTasksScreen)
const STATUS_INFO = {
  in_progress: {
    label: 'Đang diễn ra',
    icon: 'radar',
    color: COLORS.primary,
    bg: COLORS.primaryLight,
  },
};

const CATEGORY_LABELS = {
  tutoring: 'Gia sư',
  pickup: 'Đưa đón',
  sitting: 'Trông trẻ',
  extracurricular: 'Ngoại khoá',
};

export default function TrackingOverviewScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fade-in animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIM.timingNormal,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await getMyTasksAsParent();
      // Chỉ giữ lại task in_progress — tab này dành cho theo dõi trực tiếp
      const inProgress = (res.data || []).filter((t) => t.status === 'in_progress');
      setTasks(inProgress);
    } catch (e) {
      console.error('TrackingOverview fetch error:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTasks();
  }, [fetchTasks]);

  const handleTrackTask = (task) => {
    navigation.navigate('LiveTracking', { taskId: task.id });
  };

  const renderItem = ({ item, index }) => {
    const statusInfo = STATUS_INFO[item.status] || STATUS_INFO.in_progress;
    const categoryLabel = CATEGORY_LABELS[item.category] || item.category || 'Dịch vụ';
    const caretakerName = item.caretaker_name || item.caretaker?.full_name || 'CarePartner';

    return (
      <Animated.View
        style={[
          styles.taskCard,
          {
            opacity: fadeAnim,
            transform: [{
              translateY: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            }],
          },
          { marginBottom: index === tasks.length - 1 ? 0 : SIZES.md },
        ]}
      >
        {/* Header row: category + status pill */}
        <View style={styles.cardHeader}>
          <View style={styles.categoryRow}>
            <View style={styles.categoryIconBox}>
              <Ionicons name="location" size={16} color={COLORS.primary} />
            </View>
            <Text style={styles.categoryText} numberOfLines={1} ellipsizeMode="tail">
              {categoryLabel}
            </Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: statusInfo.bg }]}>
            <Ionicons name={statusInfo.icon} size={12} color={statusInfo.color} />
            <Text style={[styles.statusText, { color: statusInfo.color }]}>
              {statusInfo.label}
            </Text>
          </View>
        </View>

        {/* Title + address */}
        <Text style={styles.taskTitle} numberOfLines={2} ellipsizeMode="tail">
          {item.title || 'Nhiệm vụ không có tiêu đề'}
        </Text>
        {item.address ? (
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={14} color={COLORS.outline} />
            <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="tail">
              {item.address}
            </Text>
          </View>
        ) : null}

        {/* CarePartner info */}
        <View style={styles.caretakerRow}>
          <View style={styles.caretakerAvatar}>
            <Ionicons name="person" size={16} color={COLORS.primary} />
          </View>
          <Text style={styles.caretakerName} numberOfLines={1} ellipsizeMode="tail">
            {caretakerName}
          </Text>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Đang thực hiện</Text>
        </View>

        {/* CTA: Theo dõi trực tiếp */}
        <TouchableOpacity
          style={styles.trackBtn}
          onPress={() => handleTrackTask(item)}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={`Theo dõi trực tiếp nhiệm vụ ${item.title || ''}`}
        >
          <Ionicons name="navigate" size={18} color={COLORS.textOnPrimary} />
          <Text style={styles.trackBtnText}>Theo dõi trực tiếp</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textOnPrimary} />
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="radar-outline" size={56} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>Chưa có nhiệm vụ nào đang theo dõi</Text>
      <Text style={styles.emptyDesc}>
        Khi có CarePartner bắt đầu thực hiện nhiệm vụ của bạn, bạn sẽ thấy danh
        sách theo dõi trực tiếp tại đây.
      </Text>
      <TouchableOpacity
        style={styles.emptyCta}
        onPress={() => navigation.navigate('ParentHome')}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Về trang chủ để tạo nhiệm vụ mới"
      >
        <Ionicons name="add-circle-outline" size={18} color={COLORS.textOnPrimary} />
        <Text style={styles.emptyCtaText}>Tạo nhiệm vụ mới</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />

      {/* Top App Bar */}
      <View style={[styles.appBar, { paddingTop: insets.top + 12, paddingBottom: 12 }]}>
        <View style={{ width: 44 }} />
        <Text style={styles.appBarTitle}>Theo dõi</Text>
        <View style={styles.appBarRight}>
          <NotificationBell />
        </View>
      </View>

      {/* Summary banner */}
      <View style={styles.summaryBanner}>
        <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
        <Text style={styles.summaryText}>
          {tasks.length > 0
            ? `${tasks.length} nhiệm vụ đang được theo dõi trực tiếp`
            : 'Không có nhiệm vụ nào đang được theo dõi'}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surfaceWarm,
  },
  // === APP BAR ===
  appBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  appBarTitle: {
    ...TYPO.h3,
    color: COLORS.onSurface,
    fontWeight: '700',
  },
  appBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 44,
    justifyContent: 'flex-end',
  },
  // === SUMMARY BANNER ===
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORS.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  summaryText: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
    flex: 1,
  },
  // === LIST ===
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // === TASK CARD ===
  taskCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  categoryIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryText: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    fontWeight: '600',
    flex: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: SIZES.radiusFull,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  taskTitle: {
    ...TYPO.h3,
    color: COLORS.onSurface,
    fontWeight: '700',
    marginBottom: 6,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  addressText: {
    ...TYPO.caption,
    color: COLORS.outline,
    flex: 1,
  },
  caretakerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
    marginBottom: 12,
  },
  caretakerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  caretakerName: {
    ...TYPO.body,
    color: COLORS.onSurface,
    fontWeight: '600',
    flex: 1,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  liveText: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: '700',
  },
  // === TRACK BUTTON ===
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 14,
    ...SHADOWS.large,
  },
  trackBtnText: {
    ...TYPO.body,
    color: COLORS.textOnPrimary,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  // === EMPTY STATE ===
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    ...TYPO.h2,
    color: COLORS.onSurface,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyDesc: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 280,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    ...SHADOWS.large,
  },
  emptyCtaText: {
    ...TYPO.body,
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },
});
