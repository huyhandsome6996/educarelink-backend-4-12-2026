// ============================================================
// CandidateProfileV2Screen — Step 3 (luồng ghép cặp mới — song song luồng cũ): hồ sơ ứng viên + nút "Chọn"
// PH CHỌN → booking tạo NGAY (auto-commit Step 5) — CP không cần bấm đồng ý
// Hiện modal cảnh báo: "Đã khai rảnh + được chọn = phải đi làm"
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
import { selectCarePartner, MATCH_LEVEL_LABELS } from '../../api/matching';

// UUID đủ đặc biệt cho Idempotency-Key (chống double-submit)
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export default function CandidateProfileV2Screen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { candidate, jobId } = route.params || {};
  const [selecting, setSelecting] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  if (!candidate) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={{ color: COLORS.gray }}>Không có thông tin ứng viên.</Text>
      </View>
    );
  }

  const doSelect = async () => {
    setConfirmVisible(false);
    setSelecting(true);
    try {
      const { data: booking } = await selectCarePartner(jobId, candidate.carepartner_id, uuid());
      Alert.alert(
        'Đã chọn CarePartner',
        'Đơn đang chờ hết thời gian cam kết. CarePartner sẽ nhận thông báo có tiếng kêu ngay.',
        [{ text: 'Xem đơn', onPress: () =>
            navigation.replace('BookingDetail', { bookingId: booking.id }) }]);
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'slot_taken') {
        Alert.alert('Slot đã bị giữ',
          'Rất tiếc, CarePartner này vừa nhận đơn khác. Làm mới danh sách để xem ứng viên khác.',
          [{ text: 'Về danh sách', onPress: () => navigation.goBack() }]);
      } else {
        Alert.alert('Lỗi', 'Không chọn được ứng viên. Vui lòng thử lại.');
      }
    } finally {
      setSelecting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <ScrollView contentContainerStyle={{ padding: SIZES.padding, paddingBottom: 120 }}>
        <View style={styles.headCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(candidate.display_name || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name}>{candidate.display_name}</Text>
          <Text style={styles.school}>
            {[candidate.school, candidate.major].filter(Boolean).join(' · ')}
          </Text>
          <View style={[styles.levelBadge, { backgroundColor: COLORS.primary }]}>
            <Text style={styles.levelText}>
              {candidate.match_level_vi || MATCH_LEVEL_LABELS[candidate.match_level]} · {candidate.match_score} điểm
            </Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Ionicons name="star" size={18} color="#F5A623" />
            <Text style={styles.statNum}>{candidate.rating ?? 0}</Text>
            <Text style={styles.statLabel}>Đánh giá</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="checkmark-circle" size={18} color="#0E9F6E" />
            <Text style={styles.statNum}>{candidate.completed_jobs ?? 0}</Text>
            <Text style={styles.statLabel}>Hoàn thành</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="location" size={18} color={COLORS.primary} />
            <Text style={styles.statNum}>
              {candidate.distance_km != null ? candidate.distance_km : '—'}
            </Text>
            <Text style={styles.statLabel}>km</Text>
          </View>
        </View>

        {candidate.top_skills?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Kỹ năng</Text>
            <View style={styles.chipWrap}>
              {candidate.top_skills.map((s) => (
                <View key={s} style={styles.chip}>
                  <Text style={styles.chipText}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {!!candidate.latest_review && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Đánh giá mới nhất</Text>
            <Text style={styles.reviewText}>"{candidate.latest_review}"</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.selectBtn} disabled={selecting}
          onPress={() => setConfirmVisible(true)}>
          {selecting
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.selectText}>Chọn CarePartner này</Text>}
        </TouchableOpacity>
      </View>

      <Modal visible={confirmVisible} transparent animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Ionicons name="alert-circle" size={40} color={COLORS.primary} />
            <Text style={styles.modalTitle}>Xác nhận chọn?</Text>
            <Text style={styles.modalBody}>
              Vì {candidate.display_name} đã khai rảnh vào khung giờ này, việc chọn
              sẽ TẠO ĐƠN NGAY và họ phải cam kết thực hiện. Nếu họ hủy, hệ thống
              sẽ tự đề xuất người thay thế và bạn được đền bù bằng credit.
            </Text>
            <View style={styles.modalRow}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]}
                onPress={() => setConfirmVisible(false)}>
                <Text style={styles.modalCancelText}>Quay lại</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalOk]}
                onPress={doSelect}>
                <Text style={styles.modalOkText}>Chọn ngay</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  headCard: {
    backgroundColor: COLORS.white, borderRadius: 16, alignItems: 'center',
    padding: 24, ...SHADOWS.small,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 30, fontWeight: '800', color: COLORS.primary },
  name: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginTop: 10 },
  school: { fontSize: 13, color: COLORS.gray, marginTop: 4, textAlign: 'center' },
  levelBadge: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, marginTop: 12 },
  levelText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  statRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 16,
  },
  stat: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 14, padding: 14,
    alignItems: 'center', marginHorizontal: 4, ...SHADOWS.small,
  },
  statNum: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginTop: 4 },
  statLabel: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  section: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 16,
    marginTop: 14, ...SHADOWS.small,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: COLORS.primaryLight, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  chipText: { color: COLORS.primary, fontSize: 12, fontWeight: '500' },
  reviewText: { fontSize: 13, color: COLORS.gray, fontStyle: 'italic', lineHeight: 19 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0, padding: SIZES.padding,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  selectBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center',
  },
  selectText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center',
    justifyContent: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 22, width: '100%',
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginTop: 10 },
  modalBody: {
    fontSize: 13, color: COLORS.gray, lineHeight: 20, marginVertical: 12,
    textAlign: 'center',
  },
  modalRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  modalCancel: { backgroundColor: '#F3F4F6' },
  modalCancelText: { color: COLORS.gray, fontWeight: '600' },
  modalOk: { backgroundColor: COLORS.primary },
  modalOkText: { color: COLORS.white, fontWeight: '700' },
});
