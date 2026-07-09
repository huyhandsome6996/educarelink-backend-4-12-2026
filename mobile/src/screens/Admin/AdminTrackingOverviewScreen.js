import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Alert, FlatList, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getAdminTrackingOverview, getSOSAlerts } from '../../api/tracking';
import { getKeepaliveStats } from '../../api/admin';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

// ====================================================================
// Admin Tracking Overview — đồng bộ với web (admin_dashboard.html phần tracking)
// Xem tổng quan: consents active, live locations, SOS alerts, keepalive stats
// ====================================================================

export default function AdminTrackingOverviewScreen() {
  const navigation = useNavigation();
  const [overview, setOverview] = useState(null);
  const [keepalive, setKeepalive] = useState(null);
  const [sosAlerts, setSosAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = async () => {
    try {
      const [ovRes, kaRes] = await Promise.all([
        getAdminTrackingOverview(),
        getKeepaliveStats().catch(() => ({ data: null })),
      ]);
      setOverview(ovRes.data);
      setKeepalive(kaRes.data);

      // Fetch SOS alerts active — try với một số task phổ biến (không có endpoint list all SOS)
      // Backend không có endpoint list-all SOS nên ta dựa vào overview.active_sos
      // Hiển thị count trước, list chi tiết cần admin mở từng task
      setSosAlerts([]);
    } catch (e) {
      console.error('Admin tracking fetch error:', e);
      Alert.alert('Lỗi', 'Không tải được dữ liệu tracking.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAll();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tracking Overview</Text>
          <Ionicons name="locate" size={22} color="#fff" style={{ marginRight: 8 }} />
        </View>
        <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tracking Overview</Text>
        <Ionicons name="locate" size={22} color="#fff" style={{ marginRight: 8 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SIZES.md, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Stats grid */}
        <Text style={styles.sectionTitle}>📍 Tracking Stats</Text>
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { borderLeftColor: COLORS.success }]}>
            <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
            <Text style={styles.statValue}>{overview?.active_consents || 0}</Text>
            <Text style={styles.statLabel}>Consent active</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: COLORS.primary }]}>
            <Ionicons name="navigate" size={22} color={COLORS.primary} />
            <Text style={styles.statValue}>{overview?.active_live_locations || 0}</Text>
            <Text style={styles.statLabel}>Đang track</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: COLORS.info }]}>
            <Ionicons name="server" size={22} color={COLORS.info} />
            <Text style={styles.statValue}>{overview?.total_history_points || 0}</Text>
            <Text style={styles.statLabel}>Điểm lịch sử</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: overview?.active_sos > 0 ? COLORS.error : COLORS.divider }]}>
            <Ionicons name="warning" size={22} color={overview?.active_sos > 0 ? COLORS.error : COLORS.textMuted} />
            <Text style={[styles.statValue, { color: overview?.active_sos > 0 ? COLORS.error : COLORS.textPrimary }]}>
              {overview?.active_sos || 0}
            </Text>
            <Text style={styles.statLabel}>SOS active</Text>
          </View>
        </View>

        {/* Geofence info */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Cấu hình Geofence</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Bán kính mặc định:</Text>
            <Text style={styles.value}>{overview?.geofence_radius_meters || 500} m</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Tổng consent đã tạo:</Text>
            <Text style={styles.value}>{overview?.total_consents || 0}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Tổng SOS đã gửi:</Text>
            <Text style={styles.value}>{overview?.total_sos || 0}</Text>
          </View>
        </View>

        {/* Keep-Alive scheduler */}
        {keepalive && (
          <>
            <Text style={styles.sectionTitle}>⏰ Keep-Alive Scheduler</Text>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="pulse" size={20} color={keepalive.enabled ? COLORS.success : COLORS.textMuted} />
                <Text style={styles.cardTitle}>Trạng thái</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Bật:</Text>
                <Text style={[styles.value, { color: keepalive.enabled ? COLORS.success : COLORS.textMuted, fontWeight: '700' }]}>
                  {keepalive.enabled ? '✅ Đang chạy' : '⛔ Tắt'}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Interval:</Text>
                <Text style={styles.value}>Mỗi {keepalive.interval_minutes || 3} phút</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Ping lần cuối:</Text>
                <Text style={styles.value}>{keepalive.stats?.last_ping?.replace('T', ' ').slice(0, 19) || '—'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Status lần cuối:</Text>
                <Text style={[styles.value, { color: keepalive.stats?.last_status === 'ok' ? COLORS.success : COLORS.warning, fontWeight: '700' }]}>
                  {keepalive.stats?.last_status || '—'}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Latency:</Text>
                <Text style={styles.value}>{keepalive.stats?.last_latency_ms || 0} ms</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Tổng ping:</Text>
                <Text style={styles.value}>{keepalive.stats?.total_pings || 0}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Thành công:</Text>
                <Text style={[styles.value, { color: COLORS.success, fontWeight: '700' }]}>{keepalive.stats?.successful || 0}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Thất bại:</Text>
                <Text style={[styles.value, { color: keepalive.stats?.failed > 0 ? COLORS.error : COLORS.textMuted, fontWeight: '700' }]}>
                  {keepalive.stats?.failed || 0}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Note về SOS */}
        <View style={styles.noteCard}>
          <Ionicons name="information-circle" size={18} color={COLORS.info} />
          <Text style={styles.noteText}>
            Có {overview?.active_sos || 0} SOS alert đang active. Để xem chi tiết, mở task tracking từ Dashboard → Carepartner → Task.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
    backgroundColor: COLORS.primary, gap: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: SIZES.radiusSm,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { ...TYPO.h4, color: '#fff', fontWeight: '800', flex: 1 },
  sectionTitle: { ...TYPO.h4, color: COLORS.textPrimary, marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: {
    flex: 1, minWidth: '47%', backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 14, alignItems: 'center', gap: 4, borderLeftWidth: 4, ...SHADOWS.small,
  },
  statValue: { ...TYPO.h2, color: COLORS.textPrimary, fontWeight: '800' },
  statLabel: { ...TYPO.caption, color: COLORS.textSecondary },
  card: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: 16,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary, ...SHADOWS.cardHover,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  label: { ...TYPO.bodySmall, color: COLORS.textSecondary },
  value: { ...TYPO.body, color: COLORS.textPrimary, fontWeight: '600' },
  noteCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#EFF6FF', borderRadius: SIZES.radiusMd, padding: 14,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  noteText: { flex: 1, ...TYPO.bodySmall, color: '#1E40AF' },
});
