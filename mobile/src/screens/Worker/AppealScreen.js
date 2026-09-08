// ============================================================
// AppealScreen — Step 7.6: kháng cáo phạt trong 7 ngày
// note >= 20 ký tự; tối đa 3 đơn / 30 ngày (thứ 4 auto-reject).
// Kết quả: approved (đảo ELO, giữ đền bù PH) / partially / rejected.
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
import { createAppeal, getAppeal, CANCEL_REASONS } from '../../api/matching';

export default function AppealScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { bookingId } = route.params || {};
  const [reasonCode, setReasonCode] = useState('personal');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState(null);

  const loadExisting = useCallback(async () => {
    if (!bookingId) return;
    try {
      const { data } = await getAppeal(bookingId);
      setExisting(data);
    } catch { /* chưa có đơn kháng cáo */ }
  }, [bookingId]);

  useFocusEffect(useCallback(() => { loadExisting(); }, [loadExisting]));

  const submit = async () => {
    if (note.trim().length < 20)
      return Alert.alert('Thiếu thông tin', 'Vui lòng mô tả lý do ít nhất 20 ký tự.');
    setSubmitting(true);
    try {
      const { data } = await createAppeal(bookingId, {
        reason_code: reasonCode, note: note.trim(), evidence: [],
      });
      if (data.status === 'rejected') {
        Alert.alert('Không thể kháng cáo',
          data.status_label_vi === 'Đã từ chối' && data.status === 'rejected'
            ? 'Bạn đã vượt giới hạn 3 kháng cáo trong 30 ngày.'
            : 'Kháng cáo bị từ chối.');
      } else {
        Alert.alert('Đã gửi kháng cáo',
          'Quản trị viên sẽ xem xét trong thời gian sớm nhất. Kết quả sẽ được thông báo cho bạn.');
        navigation.goBack();
      }
    } catch (err) {
      Alert.alert('Lỗi', err?.response?.data?.detail ?? 'Không gửi được kháng cáo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <ScrollView contentContainerStyle={{ padding: SIZES.padding, paddingBottom: 40 }}>
        {existing && (
          <View style={styles.statusCard}>
            <Ionicons name="information-circle" size={22} color={COLORS.primary} />
            <Text style={styles.statusTitle}>Kháng cáo gần nhất</Text>
            <Text style={styles.statusText}>{existing.status_label_vi}</Text>
            {!!existing.admin_note && (
              <Text style={styles.statusNote}>Ghi chú admin: {existing.admin_note}</Text>
            )}
          </View>
        )}

        <Text style={styles.helper}>
          Nếu bạn cho rằng phạt là không công bằng, hãy kháng cáo trong 7 ngày.
          Nếu được chấp nhận, điểm tin nhiệm sẽ được hoàn trả (phần đền bù cho phụ
          huynh vẫn được giữ). Tối đa 3 kháng cáo mỗi 30 ngày.
        </Text>

        <Text style={styles.label}>Lý do kháng cáo</Text>
        {CANCEL_REASONS.map((r) => (
          <TouchableOpacity key={r.code}
            style={[styles.reasonRow, reasonCode === r.code && styles.reasonActive]}
            onPress={() => setReasonCode(r.code)}>
            <Text style={styles.reasonText}>{r.label}</Text>
            {reasonCode === r.code && (
              <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
            )}
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Mô tả chi tiết * (tối thiểu 20 ký tự)</Text>
        <TextInput style={styles.noteInput} multiline numberOfLines={4}
          placeholder="Kể lại tình huống cụ thể để admin xem xét..."
          value={note} onChangeText={setNote} textAlignVertical="top" />
        <Text style={styles.charCount}>{note.trim().length}/20 ký tự tối thiểu</Text>

        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={submit} disabled={submitting}>
          {submitting
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.submitText}>Gửi kháng cáo</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  statusCard: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 16,
    ...SHADOWS.small, marginBottom: 12,
  },
  statusTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 6 },
  statusText: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 2 },
  statusNote: { fontSize: 12, color: COLORS.gray, marginTop: 4 },
  helper: {
    fontSize: 12, color: COLORS.gray, lineHeight: 18, backgroundColor: '#FFF7ED',
    borderRadius: 12, padding: 12,
  },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginTop: 16, marginBottom: 8 },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, marginBottom: 8, ...SHADOWS.small,
  },
  reasonActive: { backgroundColor: COLORS.primaryLight },
  reasonText: { fontSize: 14, color: COLORS.text },
  noteInput: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14, minHeight: 110,
    fontSize: 14, color: COLORS.text, ...SHADOWS.small,
  },
  charCount: { fontSize: 11, color: COLORS.gray, marginTop: 6 },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 20,
  },
  submitText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
});
