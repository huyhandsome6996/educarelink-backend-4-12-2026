// ============================================================
// ProfileChangeRequestsScreen — WIRING FIX (2026-08-21)
// Hiển thị lịch sử yêu cầu đổi hồ sơ của Carepartner.
// Dùng getMyProfileChangeRequests() từ api/tasks.js.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Platform, Alert, Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getMyProfileChangeRequests } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO, ANIM } from '../../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_MAP = {
  pending: {
    label: 'Đang chờ duyệt',
    color: COLORS.warning,
    bg: COLORS.warningBg,
    icon: 'time',
  },
  approved: {
    label: 'Đã duyệt',
    color: COLORS.success,
    bg: COLORS.successBg,
    icon: 'checkmark-circle',
  },
  rejected: {
    label: 'Bị từ chối',
    color: COLORS.error,
    bg: COLORS.errorBg,
    icon: 'close-circle',
  },
};

const FIELD_LABELS = {
  first_name: 'Họ',
  last_name: 'Tên',
  phone_number: 'Số điện thoại',
  email: 'Email',
  address: 'Địa chỉ',
};

export default function ProfileChangeRequestsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIM.timingNormal,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const fetchData = async () => {
    try {
      const res = await getMyProfileChangeRequests();
      setRequests(res.data || []);
    } catch (e) {
      console.error('[ProfileChangeRequests] Lỗi:', e?.message || e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, []);

  const renderChanges = (changes) => {
    if (!changes || typeof changes !== 'object') return null;
    return Object.entries(changes).map(([key, value]) => {
      if (key === 'admin_review' || key === 'id' || key === 'worker' || key === 'created_at' || key === 'updated_at' || key === 'status') return null;
      const label = FIELD_LABELS[key] || key;
      return (
        <View key={key} style={styles.changeRow}>
          <Text style={styles.changeField}>{label}</Text>
          <Text style={styles.changeValue}>{String(value)}</Text>
        </View>
      );
    }).filter(Boolean);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={{ ...TYPO.body, color: COLORS.onSurfaceVariant, marginTop: 12 }}>Đang tải...</Text>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* App Bar */}
      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.appBarBtn}
          accessibilityRole="button" accessibilityLabel="Quay lại"
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Lịch sử yêu cầu đổi hồ sơ</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {requests.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="document-text-outline" size={40} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>Chưa có yêu cầu nào</Text>
            <Text style={styles.emptyText}>
              Bạn chưa gửi yêu cầu thay đổi hồ sơ nào. Vào "Hồ sơ" > "Yêu cầu sửa hồ sơ" để bắt đầu.
            </Text>
          </View>
        ) : (
          requests.map((req) => {
            const st = STATUS_MAP[req.status] || STATUS_MAP.pending;
            return (
              <View key={req.id} style={styles.card}>
                {/* Header row */}
                <View style={styles.cardHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                    <Ionicons name={st.icon} size={14} color={st.color} />
                    <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                  </View>
                  <Text style={styles.dateText}>
                    {new Date(req.created_at).toLocaleString('vi-VN', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                </View>

                {/* Changes */}
                {renderChanges(req)}

                {/* Admin review — chỉ hiện khi bị từ chối */}
                {req.status === 'rejected' && req.admin_review && (
                  <View style={styles.reviewBox}>
                    <Ionicons name="information-circle" size={16} color={COLORS.error} />
                    <Text style={styles.reviewText}>Lý do: {req.admin_review}</Text>
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  appBarBtn: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  appBarTitle: { ...TYPO.h3, color: COLORS.onSurface },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 14 },
  // === EMPTY STATE ===
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  emptyTitle: { ...TYPO.h4, color: COLORS.onSurface },
  emptyText: {
    ...TYPO.bodySmall, color: COLORS.onSurfaceVariant,
    textAlign: 'center', paddingHorizontal: 20, lineHeight: 20,
  },
  // === CARD ===
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { ...TYPO.caption, fontWeight: '700' },
  dateText: { ...TYPO.caption, color: COLORS.onSurfaceVariant },
  // === CHANGES ===
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  changeField: { ...TYPO.body, color: COLORS.onSurfaceVariant, fontWeight: '500' },
  changeValue: { ...TYPO.body, color: COLORS.onSurface, fontWeight: '700' },
  // === REVIEW BOX ===
  reviewBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.errorContainer,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  reviewText: {
    flex: 1,
    ...TYPO.bodySmall,
    color: COLORS.errorDeep,
    lineHeight: 18,
  },
});
