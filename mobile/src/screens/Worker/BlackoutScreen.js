// ============================================================
// BlackoutScreen — Step 9.2: ngày không thể nhận việc (bận đột xuất)
// Chọn ngày + cả ngày/khung giờ + lý do. Trùng booking → 409
// blackout_conflicts_with_booking → hướng dẫn hủy/đổi giờ trước.
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, RefreshControl, Platform, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
import { getBlackouts, addBlackout, deleteBlackout } from '../../api/matching';
import { formatDateToYMD } from '../../utils/date';

let DateTimePicker;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

const REASONS = [
  { code: 'exam', label: 'Thi / kiểm tra' },
  { code: 'health', label: 'Sức khỏe' },
  { code: 'family', label: 'Việc gia đình' },
  { code: 'travel', label: 'Đi xa' },
  { code: 'personal', label: 'Cá nhân' },
  { code: 'other', label: 'Khác' },
];

export default function BlackoutScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [allDay, setAllDay] = useState(true);
  const [timeFrom, setTimeFrom] = useState('07:00');
  const [timeTo, setTimeTo] = useState('12:00');
  const [reason, setReason] = useState('exam');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await getBlackouts();
      setItems(data ?? []);
    } catch (err) {
      // Lỗi mạng/server → thông báo tiếng Việt + nút thử lại (không crash)
      setLoadError('Không tải được ngày bận. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickDate = (_e, selected) => {
    setShowPicker(Platform.OS === 'ios');
    if (!selected) return;
    const date = formatDateToYMD(selected);
    const payload = {
      date, reason,
      time_from: allDay ? null : timeFrom,
      time_to: allDay ? null : timeTo,
    };
    addBlackout(payload)
      .then(load)
      .catch((err) => {
        const body = err?.response?.data;
        if (err?.response?.status === 409) {
          Alert.alert('Trùng đơn đã xác nhận',
            'Ngày này bạn đang có đơn. Hãy hủy hoặc đổi giờ đơn trước khi khai bận.');
        } else if (body?.code === 'too_many_blackouts') {
          Alert.alert('Giới hạn', body.detail ?? 'Tối đa 30 ngày bận trong tương lai.');
        } else {
          Alert.alert('Lỗi', 'Không lưu được ngày bận.');
        }
      });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <Text style={styles.helper}>
        Khai báo ngày bạn KHÔNG THỂ nhận việc (thi, ốm, việc đột xuất...). Ngày
        này sẽ bị loại khỏi danh sách ghép cặp.
      </Text>

      <View style={styles.formCard}>
        <View style={styles.row}>
          <Text style={styles.label}>Bận cả ngày</Text>
          <Switch value={allDay} onValueChange={setAllDay} trackColor={{ true: COLORS.primary }} />
        </View>
        {!allDay && (
          <View style={styles.row}>
            <Text style={styles.label}>Từ</Text>
            <Text style={styles.timeText}>{timeFrom}</Text>
            <Text style={styles.label}> Đến</Text>
            <Text style={styles.timeText}>{timeTo}</Text>
          </View>
        )}
        <View style={styles.chipWrap}>
          {REASONS.map((r) => (
            <TouchableOpacity key={r.code}
              style={[styles.chip, reason === r.code && styles.chipActive]}
              onPress={() => setReason(r.code)}>
              <Text style={[styles.chipText, reason === r.code && styles.chipTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.pickBtn} onPress={() => setShowPicker(true)}>
          <Ionicons name="calendar" size={18} color={COLORS.white} />
          <Text style={styles.pickBtnText}>Chọn ngày bận</Text>
        </TouchableOpacity>
        {showPicker && DateTimePicker && (
          <DateTimePicker value={new Date()} mode="date" onChange={pickDate} />
        )}
      </View>

      <Text style={styles.listTitle}>Các ngày đã khai</Text>
      {loadError ? (
        <View style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={34} color="#d1d5db" />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={() => (
          <Text style={styles.empty}>Chưa khai ngày bận nào.</Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemDate}>{item.date}</Text>
              <Text style={styles.itemHours}>
                {item.time_from
                  ? `${item.time_from.slice(0, 5)} - ${item.time_to.slice(0, 5)}`
                  : 'Cả ngày'}
                {' · '}
                {REASONS.find((r) => r.code === item.reason)?.label ?? item.reason}
              </Text>
            </View>
            <TouchableOpacity onPress={async () => {
              try { await deleteBlackout(item.id); await load(); } catch { /* noop */ }
            }}>
              <Ionicons name="trash-outline" size={19} color="#DC2626" />
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={{ paddingHorizontal: SIZES.padding, paddingBottom: 40 }}
      />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  helper: {
    fontSize: 12, color: COLORS.gray, lineHeight: 18, backgroundColor: '#FFF7ED',
    borderRadius: 12, padding: 12, margin: SIZES.padding, marginBottom: 8,
  },
  formCard: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 16,
    marginHorizontal: SIZES.padding, ...SHADOWS.small,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  timeText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: '#F3F4F6',
  },
  chipActive: { backgroundColor: COLORS.primary },
  chipText: { fontSize: 12, color: COLORS.text },
  chipTextActive: { color: COLORS.white, fontWeight: '600' },
  pickBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  pickBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  listTitle: {
    paddingHorizontal: SIZES.padding, paddingTop: 18, paddingBottom: 8,
    fontSize: 15, fontWeight: '700', color: COLORS.text,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: 12, padding: 14, marginBottom: 8, ...SHADOWS.small,
  },
  itemDate: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  itemHours: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  empty: { textAlign: 'center', color: COLORS.gray, paddingVertical: 24 },
  errorBox: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: SIZES.padding },
  errorText: { marginTop: 10, color: COLORS.gray, textAlign: 'center' },
  retryBtn: {
    marginTop: 14, paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 16, backgroundColor: COLORS.primary,
  },
  retryText: { color: COLORS.white, fontWeight: '600' },
});
