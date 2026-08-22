// ============================================================
// SmartMatchesScreen — Feature A2: Smart Job Matching
// Phụ huynh xem danh sách CarePartner được AI đề xuất cho 1 task
// Pattern: CandidatesScreen styling + Warm Professionalism
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, Animated, Pressable,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSmartMatches } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO, ANIM } from '../../theme/colors';

// Rank medal config — gold / silver / bronze cho top 3
const RANK_CONFIG = [
  { bg: COLORS.tierGoldBg, color: COLORS.tierGold, icon: 'trophy' },
  { bg: COLORS.tierSilverBg, color: COLORS.tierSilver, icon: 'medal' },
  { bg: '#EDE9FE', color: '#7C3AED', icon: 'medal-outline' },
];

// Format distance: metres → "Xm" or "X.Xkm"
const formatDistance = (meters) => {
  if (meters == null) return '';
  const m = Number(meters);
  if (isNaN(m)) return '';
  if (m >= 1000) {
    const km = m / 1000;
    return `${km.toFixed(1)}km`;
  }
  return `${Math.round(m)}m`;
};

export default function SmartMatchesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { taskId } = route.params || {};

  // Fade-in animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIM.timingNormal,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const [matches, setMatches] = useState([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMatches = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getSmartMatches(taskId);
      // Backend could return { matches: [...], message: "..." } or just a list
      const data = res.data;
      if (Array.isArray(data)) {
        setMatches(data);
      } else if (data && Array.isArray(data.matches)) {
        setMatches(data.matches);
        setMessage(data.message || '');
      } else {
        setMatches([]);
        setMessage(data?.message || 'Không có gợi ý phù hợp.');
      }
    } catch (e) {
      const msg = e.response?.data?.error || e.response?.data?.detail || 'Không thể tải gợi ý.';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (taskId) fetchMatches();
  }, [taskId]);

  // Get display name from worker data
  const getDisplayName = (worker) => {
    if (!worker) return 'CarePartner';
    if (worker.first_name || worker.last_name) {
      return `${worker.first_name || ''} ${worker.last_name || ''}`.trim();
    }
    return worker.username || 'CarePartner';
  };

  // Render a single match card
  const renderMatch = ({ item, index }) => {
    const worker = item.worker || item;
    const displayName = getDisplayName(worker);
    const rank = index + 1;
    const medal = RANK_CONFIG[index] || null;
    const distance = item.distance_m != null ? formatDistance(item.distance_m) : '';
    const availability = item.availability_text || '';
    const todayJobs = item.tasks_today ?? 0;
    const weekJobs = item.tasks_this_week ?? 0;
    const reason = item.rank_reason || '';

    return (
      <View style={styles.card}>
        {/* Top row: rank + avatar + name + distance */}
        <View style={styles.cardTop}>
          {/* Rank badge */}
          <View style={[
            styles.rankBadge,
            medal ? { backgroundColor: medal.bg } : { backgroundColor: COLORS.background },
          ]}>
            {medal ? (
              <Ionicons name={medal.icon} size={medal.icon === 'trophy' ? 22 : 18} color={medal.color} />
            ) : (
              <Text style={[styles.rankNumber, !medal && { color: COLORS.textMuted }]}>{rank}</Text>
            )}
          </View>

          {/* Avatar (initials) or placeholder */}
          {worker?.avatar ? (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{displayName[0]?.toUpperCase() || '?'}</Text>
            </View>
          ) : (
            <View style={styles.avatar}>
              <Ionicons name="person" size={22} color={COLORS.textOnPrimary} />
            </View>
          )}

          {/* Name + distance */}
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1} ellipsizeMode="tail">
              {displayName}
            </Text>
            <View style={styles.cardMetaRow}>
              {distance ? (
                <View style={styles.metaChip}>
                  <Ionicons name="location-outline" size={12} color={COLORS.primary} />
                  <Text style={styles.metaChipText}>{distance}</Text>
                </View>
              ) : null}
              {todayJobs > 0 || weekJobs > 0 ? (
                <View style={styles.metaChip}>
                  <Ionicons name="briefcase-outline" size={12} color={COLORS.onSurfaceVariant} />
                  <Text style={styles.metaChipText}>
                    {todayJobs} việc hôm nay, {weekJobs} việc tuần này
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Availability window */}
        {availability ? (
          <View style={styles.availabilityRow}>
            <Ionicons name="calendar-outline" size={14} color={COLORS.success} />
            <Text style={styles.availabilityText}>{availability}</Text>
          </View>
        ) : null}

        {/* Rank reason */}
        {reason ? (
          <View style={styles.reasonBox}>
            <Ionicons name="sparkles" size={12} color={COLORS.primary} style={{ marginTop: 1 }} />
            <Text style={styles.reasonText}>{reason}</Text>
          </View>
        ) : null}

        {/* "Xem hồ sơ" button */}
        <TouchableOpacity
          style={styles.viewProfileBtn}
          onPress={() => {
            const workerId = worker?.id || item.worker_id;
            if (workerId) {
              navigation.navigate('CandidateProfile', {
                workerId,
                isPending: false,
              });
            }
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.viewProfileBtnText}>Xem hồ sơ</Text>
          <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* App Bar */}
      <View style={[styles.appBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.appBarBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Gợi ý phù hợp</Text>
        <TouchableOpacity
          onPress={fetchMatches}
          style={styles.appBarBtn}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Làm mới"
        >
          <Ionicons
            name="refresh"
            size={20}
            color={COLORS.primary}
            style={isLoading && { opacity: 0.4 }}
          />
        </TouchableOpacity>
      </View>

      {/* AI info banner */}
      <View style={styles.aiBanner}>
        <View style={styles.aiBannerLeft}>
          <Ionicons name="sparkles" size={16} color={COLORS.primary} />
          <Text style={styles.aiBannerTitle}>Smart Matching</Text>
        </View>
        <Text style={styles.aiBannerText}>
          AI đề xuất dựa trên khoảng cách, khung giờ rảnh và tải việc hiện tại.
        </Text>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>AI đang tìm CarePartner phù hợp...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <View style={styles.errorIconCircle}>
            <Ionicons name="cloud-offline-outline" size={40} color={COLORS.error} />
          </View>
          <Text style={styles.errorTitle}>Không thể tải gợi ý</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchMatches} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color={COLORS.textOnPrimary} />
            <Text style={styles.retryBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="search-outline" size={40} color={COLORS.primary} />
          </View>
          <Text style={styles.emptyTitle}>Chưa có gợi ý</Text>
          <Text style={styles.emptyText}>
            {message || 'Hiện chưa có CarePartner phù hợp cho yêu cầu này. Hãy thử lại sau.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item, idx) => item.worker?.id?.toString() || item.worker_id?.toString() || `match_${idx}`}
          renderItem={renderMatch}
          contentContainerStyle={styles.list}
        />
      )}
    </Animated.View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: COLORS.surface,
  },
  appBarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appBarTitle: {
    ...TYPO.h3,
    color: COLORS.onSurface,
  },
  // === AI BANNER ===
  aiBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    backgroundColor: COLORS.primaryLight,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
    gap: 6,
  },
  aiBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiBannerTitle: {
    ...TYPO.h5,
    color: COLORS.primary,
  },
  aiBannerText: {
    ...TYPO.bodySmall,
    color: COLORS.primaryDark,
    lineHeight: 18,
  },
  // === CENTER CONTAINERS ===
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    ...TYPO.bodySmall,
    color: COLORS.textMuted,
    marginTop: 12,
  },
  errorIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.errorBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    ...SHADOWS.small,
  },
  errorTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
    marginTop: 12,
  },
  errorText: {
    ...TYPO.bodySmall,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 4,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radiusFull,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 20,
    ...SHADOWS.large,
  },
  retryBtnText: {
    ...TYPO.buttonSmall,
    color: COLORS.textOnPrimary,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    ...SHADOWS.small,
  },
  emptyTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
    marginTop: 12,
  },
  emptyText: {
    ...TYPO.bodySmall,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
  },
  // === LIST ===
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  // === CARD ===
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusLg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    gap: 12,
    ...SHADOWS.small,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // === RANK BADGE ===
  rankBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNumber: {
    ...TYPO.h4,
    fontSize: 18,
  },
  // === AVATAR ===
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  avatarText: {
    color: COLORS.textOnPrimary,
    ...TYPO.h3,
  },
  // === CARD INFO ===
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardName: {
    ...TYPO.h4,
    color: COLORS.onSurface,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaChipText: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    fontSize: 11,
  },
  // === AVAILABILITY ===
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: COLORS.successBg,
    borderRadius: SIZES.radiusSm,
    alignSelf: 'flex-start',
  },
  availabilityText: {
    ...TYPO.bodySmall,
    color: COLORS.successDeep,
  },
  // === REASON ===
  reasonBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: SIZES.radiusSm,
    padding: 10,
  },
  reasonText: {
    flex: 1,
    ...TYPO.bodySmall,
    color: COLORS.onSurfaceVariant,
    lineHeight: 18,
  },
  // === VIEW PROFILE BUTTON ===
  viewProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primaryLight,
    borderRadius: SIZES.radiusSm,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: COLORS.primarySoft,
  },
  viewProfileBtnText: {
    ...TYPO.buttonSmall,
    color: COLORS.primary,
  },
});
