// ============================================================
// AvailabilityScreen (Flow mới) — Step 4: khai báo lịch rảnh tuần
// 7 toggle ngày, nhiều khung giờ/ngày, sửa BẤT CỨ LÚC NÀO.
// Window có booking active → API trả 409 availability_locked_by_booking
// → hiện cảnh báo "Đang có đơn - không thể xóa. Hãy hủy đơn nếu cần."
// Endpoint: /api/matching/carepartners/me/availability (time_from/time_to)
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, TextInput, RefreshControl, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
import {
  getAvailability, addAvailability, deleteAvailability,
} from '../../api/matching';

const WEEKDAYS = [
  { value: 0, label: 'Thứ 2' }, { value: 1, label: 'Thứ 3' },
  { value: 2, label: 'Thứ 4' }, { value: 3, label: 'Thứ 5' },
  { value: 4, label: 'Thứ 6' }, { value: 5, label: 'Thứ 7' },
  { value: 6, label: 'Chủ nhật' },
];

export default function AvailabilityScreen() {
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weekday, setWeekday] = useState(0);
  const [timeFrom, setTimeFrom] = useState('18:00');
  const [timeTo, setTimeTo] = useState('21:00');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await getAvailability();
      setWindows(data.windows ?? []);
    } catch (err) {
      // Lỗi mạng/server → thông báo tiếng Việt + nút thử lại (không crash)
      setLoadError('Không tải được lịch rảnh. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addWindow = async () => {
    if (!timeFrom || !timeTo || timeTo <= timeFrom)
      return Alert.alert('Không hợp lệ', 'Giờ kết thúc phải sau giờ bắt đầu.');
    setSaving(true);
    try {
      await addAvailability({ weekday, time_from: timeFrom, time_to: timeTo });
      await load();
    } catch (err) {
      const body = err?.response?.data;
      if (body?.code === 'overlap_windows') {
        const m = body.merge_suggestion;
        Alert.alert('Khung giờ chồng lấn',
          `Gợi ý: gộp thành ${m?.time_from?.slice(0, 5)} - ${m?.time_to?.slice(0, 5)}`);
      } else {
        Alert.alert('Lỗi', typeof body?.detail === 'string' ? body.detail
          : 'Không lưu được khung giờ.');
      }
    } finally {
      setSaving(false);
    }
  };

  const removeWindow = (w) => {
    Alert.alert('Xóa khung giờ?', `${w.weekday_label} ${w.time_from.slice(0, 5)}-${w.time_to.slice(0, 5)}`,
      [
        { text: 'Đóng', style: 'cancel' },
        {
          text: 'Xóa', style: 'destructive',
          onPress: async () => {
            try {
              await deleteAvailability(w.id);
              await load();
            } catch (err) {
              if (err?.response?.status === 409) {
                Alert.alert('Đang có đơn',
                  'Đang có đơn - không thể xóa. Hãy hủy đơn nếu cần.');
              } else {
                Alert.alert('Lỗi', 'Không xóa được khung giờ.');
              }
            }
          },
        },
      ]);
  };

  const dayWindows = windows.filter((w) => w.weekday === weekday);
  const weekdayLabel = (v) => WEEKDAYS.find((d) => d.value === v)?.label ?? '';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <Text style={styles.helper}>
        Đây là thời gian bạn có thể nhận việc. Bạn có thể thay đổi bất cứ lúc nào.
        {'\n'}Khi bạn khai rảnh và được phụ huynh chọn, bạn có trách nhiệm thực hiện.
        Hủy ngang sẽ ảnh hưởng đến điểm tin nhiệm.
      </Text>

      <View style={styles.dayRow}>
        {WEEKDAYS.map((d) => (
          <TouchableOpacity key={d.value}
            style={[styles.dayBtn, weekday === d.value && styles.dayBtnActive]}
            onPress={() => setWeekday(d.value)}>
            <Text style={[styles.dayText, weekday === d.value && styles.dayTextActive]}>
              {d.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loadError ? (
        <View style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={34} color="#d1d5db" />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} /> : (
        <View style={styles.windowList}>
          {dayWindows.length === 0 && (
            <Text style={styles.emptyDay}>Chưa khai khung giờ nào cho {weekdayLabel(weekday)}.</Text>
          )}
          {dayWindows.map((w) => (
            <View key={w.id} style={styles.windowRow}>
              <Ionicons name="time" size={18} color={COLORS.primary} />
              <Text style={styles.windowText}>
                {w.time_from.slice(0, 5)} - {w.time_to.slice(0, 5)}
              </Text>
              <TouchableOpacity onPress={() => removeWindow({ ...w, weekday_label: weekdayLabel(w.weekday) })}>
                <Ionicons name="trash-outline" size={19} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.addBox}>
        <Text style={styles.addTitle}>Thêm khung giờ — {weekdayLabel(weekday)}</Text>
        <View style={styles.addRow}>
          <TextInput style={styles.timeInput} placeholder="18:00" value={timeFrom}
            onChangeText={setTimeFrom} />
          <Text style={styles.arrow}>→</Text>
          <TextInput style={styles.timeInput} placeholder="21:00" value={timeTo}
            onChangeText={setTimeTo} />
          <TouchableOpacity style={styles.addBtn} disabled={saving} onPress={addWindow}>
            {saving
              ? <ActivityIndicator color={COLORS.white} size="small" />
              : <Text style={styles.addBtnText}>+ Thêm</Text>}
          </TouchableOpacity>
        </View>
        <Text style={styles.midnightHint}>
          Khung giờ qua nửa đêm (VD 22:00 → 01:00) hệ thống tự tách làm 2.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SIZES.padding },
  helper: {
    fontSize: 12, color: COLORS.gray, lineHeight: 18, backgroundColor: '#FFF7ED',
    borderRadius: 12, padding: 12, marginTop: 8,
  },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  dayBtn: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10 },
  dayBtnActive: { backgroundColor: COLORS.primary },
  dayText: { fontSize: 11, color: COLORS.gray, fontWeight: '600' },
  dayTextActive: { color: COLORS.white },
  windowList: { marginTop: 16 },
  emptyDay: { color: COLORS.gray, fontSize: 13, textAlign: 'center', paddingVertical: 18 },
  errorBox: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: SIZES.padding },
  errorText: { marginTop: 10, color: COLORS.gray, textAlign: 'center' },
  retryBtn: {
    marginTop: 14, paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 16, backgroundColor: COLORS.primary,
  },
  retryText: { color: COLORS.white, fontWeight: '600' },
  windowRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: 12, padding: 14, marginBottom: 8, gap: 10, ...SHADOWS.small,
  },
  windowText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
  addBox: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 16, marginTop: 16,
    ...SHADOWS.small,
  },
  addTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: {
    flex: 1, backgroundColor: '#F9FAFB', borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 15, textAlign: 'center', color: COLORS.text,
  },
  arrow: { color: COLORS.gray },
  addBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 10,
    paddingHorizontal: 14,
  },
  addBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  midnightHint: { fontSize: 11, color: COLORS.gray, marginTop: 8 },
});
