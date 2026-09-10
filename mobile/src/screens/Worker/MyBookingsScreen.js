// ============================================================
// MyBookingsScreen (Flow mới) — Step 5.5 GET /api/matching/bookings
// Danh sách đơn ghép cặp của CarePartner, lọc theo trạng thái.
// Trạng thái hiển thị nhãn tiếng Việt, tab lọc nhanh.
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
import { getBookings } from '../../api/matching';

const FILTERS = [
  { key: '', label: 'Tất cả' },
  { key: 'awaiting_commitment', label: 'Chờ cam kết' },
  { key: 'committed', label: 'Đã cam kết' },
  { key: 'in_progress', label: 'Đang làm' },
  { key: 'completed', label: 'Hoàn thành' },
  { key: 'cancelled_by_carepartner', label: 'Đã hủy' },
];

// Đơn có thể bị phạt ELO → được phép kháng cáo trong 7 ngày (Step 7.6).
// Backend vẫn kiểm tra lại EloLedger âm + hạn 7 ngày + giới hạn 3 lần/30 ngày.
const APPEALABLE = [
  'cancelled_by_carepartner', 'no_show', 'no_show_unconfirmed', 'suspected_no_show',
];

export default function MyBookingsScreen() {
  const navigation = useNavigation();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getBookings({ role: 'carepartner', status: filter || undefined });
      setItems(data.results ?? []);
    } catch (err) {
      // Lỗi mạng/server → thông báo tiếng Việt + cho phép kéo làm mới thử lại
      setError('Không tải được danh sách đơn. Vui lòng kéo xuống để thử lại.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: SIZES.padding }}>
          {FILTERS.map((f) => (
            <TouchableOpacity key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterActive]}
              onPress={() => setFilter(f.key)}>
              <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={36} color="#d1d5db" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Ionicons name="briefcase-outline" size={44} color="#ddd" />
              <Text style={styles.emptyText}>Chưa có đơn nào ở mục này.</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card}
              onPress={() => navigation.navigate('BookingDetail', { bookingId: item.id })}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.job_title || 'Công việc ghép cặp'}
                </Text>
                <Text style={styles.status}>{item.status_label_vi}</Text>
              </View>
              {item.first_slot && (
                <View style={styles.metaRow}>
                  <Ionicons name="calendar" size={13} color={COLORS.primary} />
                  <Text style={styles.meta}>
                    {item.first_slot.date} · {item.first_slot.time_from.slice(0, 5)}
                    -{item.first_slot.time_to.slice(0, 5)}
                  </Text>
                </View>
              )}
              {/* Đồng bộ web QA 2026-09-11: hiển thị phụ huynh + địa chỉ (field mới của API) */}
              {item.parent_name ? (
                <View style={styles.metaRow}>
                  <Ionicons name="person" size={13} color={COLORS.primary} />
                  <Text style={styles.meta} numberOfLines={1}>Phụ huynh {item.parent_name}</Text>
                </View>
              ) : null}
              {item.job_address ? (
                <View style={styles.metaRow}>
                  <Ionicons name="location" size={13} color={COLORS.primary} />
                  <Text style={styles.meta} numberOfLines={1}>{item.job_address}</Text>
                </View>
              ) : null}
              <View style={styles.metaRow}>
                <Ionicons name="cash" size={13} color="#0E9F6E" />
                <Text style={styles.meta}>
                  {item.total_value_vnd?.toLocaleString('vi-VN')}đ
                </Text>
                {item.compensation_vnd > 0 && (
                  <Text style={[styles.meta, { color: '#F5A623' }]}>
                    · Đền bù {item.compensation_vnd.toLocaleString('vi-VN')}đ
                  </Text>
                )}
              </View>
              {APPEALABLE.includes(item.status) && (
                <TouchableOpacity
                  style={styles.appealBtn}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('Appeal', { bookingId: item.id })}
                >
                  <Ionicons name="megaphone-outline" size={14} color="#B45309" />
                  <Text style={styles.appealText}>Kháng cáo</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: SIZES.padding, paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  errorBox: { alignItems: 'center', paddingTop: 60, paddingHorizontal: SIZES.padding },
  errorText: { marginTop: 10, color: COLORS.gray, textAlign: 'center' },
  retryBtn: {
    marginTop: 14, paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 16, backgroundColor: COLORS.primary,
  },
  retryText: { color: COLORS.white, fontWeight: '600' },
  appealBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: '#FEF3C7',
  },
  appealText: { fontSize: 12, fontWeight: '700', color: '#B45309' },
  filterRow: { paddingTop: 12, paddingBottom: 4 },
  filterChip: {
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: '#eee',
  },
  filterActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: 12, color: COLORS.gray },
  filterTextActive: { color: COLORS.white, fontWeight: '600' },
  card: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 15,
    marginBottom: 10, ...SHADOWS.small,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text, marginRight: 8 },
  status: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  meta: { fontSize: 12, color: COLORS.gray },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { marginTop: 12, color: COLORS.gray },
});
