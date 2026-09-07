// ============================================================
// TutoringForm — Flow 1 Step 1 §A: Đăng việc GIA SƯ
// Môn học là TEXT TỰ DO: chấp nhận kỹ năng (MC, kỹ năng sống, đàn, vẽ...)
// — KHÔNG bắt buộc môn phổ thông (master prompt rule 5).
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Alert, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
import { createJob, publishJob } from '../../api/matching';

// Map picker dùng chung: tìm kiếm + vị trí hiện tại + chọn pin + note vị trí
import JobLocationPicker from '../../components/JobLocationPicker';

// DateTimePicker chỉ trên native (pattern CreateTaskScreen)
let DateTimePicker;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

export default function TutoringForm() {
  const navigation = useNavigation();
  const [subject, setSubject] = useState('');
  const [requirements, setRequirements] = useState('');
  const [dates, setDates] = useState([]); // 'YYYY-MM-DD'
  const [timeFrom, setTimeFrom] = useState('19:00');
  const [timeTo, setTimeTo] = useState('21:00');
  const [rate, setRate] = useState('');
  const [location, setLocation] = useState(null); // {latitude, longitude}
  const [locationNote, setLocationNote] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addDate = (_event, selected) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (!selected) return;
    const iso = selected.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    if (iso < today) {
      Alert.alert('Không hợp lệ', 'Không được chọn ngày trong quá khứ.');
      return;
    }
    if (!dates.includes(iso)) setDates([...dates, iso].sort());
  };

  const submit = async () => {
    if (!subject.trim()) return Alert.alert('Thiếu thông tin', 'Vui lòng nhập môn học / kỹ năng.');
    if (dates.length === 0) return Alert.alert('Thiếu thông tin', 'Vui lòng chọn ngày học.');
    if (!timeFrom || !timeTo || timeTo <= timeFrom)
      return Alert.alert('Thiếu thông tin', 'Giờ kết thúc phải sau giờ bắt đầu.');
    if (!location) return Alert.alert('Thiếu thông tin', 'Vui lòng chọn vị trí trên bản đồ.');
    if (!rate || Number(rate) <= 0)
      return Alert.alert('Thiếu thông tin', 'Vui lòng nhập giá/giờ (VND > 0).');

    setSubmitting(true);
    try {
      const { data: job } = await createJob({
        job_type: 'tutoring',
        subject: subject.trim(),
        specific_requirements: requirements.trim(),
        dates,
        time_from: timeFrom,
        time_to: timeTo,
        latitude: location.latitude,
        longitude: location.longitude,
        location_note: locationNote,
        hourly_rate_vnd: Number(rate),
      });
      // Đăng + chạy AI parse ngay (Step 1.2 → ai_parsed + tạo slots)
      const { data: published } = await publishJob(job.id);
      Alert.alert(
        'Đã đăng bài',
        published.needs_admin_review
          ? 'Bài đăng của bạn đang chờ kiểm duyệt an toàn.'
          : `Hệ thống đã tìm được ứng viên cho bạn. (${published.ai_parse_status === 'ok' ? 'AI đã phân tích' : 'Đã phân tích'})`,
        [{ text: 'Xem ứng viên', onPress: () =>
          navigation.navigate('CandidatesList', { jobId: job.id }) },
         { text: 'Để sau', style: 'cancel' }]);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      Alert.alert('Lỗi', typeof detail === 'string' ? detail
        : 'Không đăng được bài. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <ScrollView contentContainerStyle={{ padding: SIZES.padding, paddingBottom: 40 }}>
        <Text style={styles.label}>Môn học / kỹ năng *</Text>
        <TextInput style={styles.input} placeholder="VD: Toán lớp 5, MC, Kỹ năng sống, Đàn piano..."
          value={subject} onChangeText={setSubject} />

        <Text style={styles.label}>Yêu cầu cụ thể *</Text>
        <TextInput style={[styles.input, styles.textarea]}
          placeholder="VD: Cần người kiên nhẫn, bé nữ lớp 5..."
          value={requirements} onChangeText={setRequirements} multiline numberOfLines={3} />

        <Text style={styles.label}>Ngày học * (chọn nhiều ngày được)</Text>
        <View style={styles.dateRow}>
          {dates.map((d) => (
            <TouchableOpacity key={d} style={styles.dateChip} onPress={() =>
              setDates(dates.filter((x) => x !== d))}>
              <Text style={styles.dateChipText}>{d}  ✕</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.pickBtn} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.pickBtnText}>+ Chọn ngày</Text>
        </TouchableOpacity>
        {showDatePicker && DateTimePicker && (
          <DateTimePicker value={new Date()} mode="date" onChange={addDate} />
        )}

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>Từ *</Text>
            <TextInput style={styles.input} placeholder="19:00" value={timeFrom}
              onChangeText={setTimeFrom} />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Đến *</Text>
            <TextInput style={styles.input} placeholder="21:00" value={timeTo}
              onChangeText={setTimeTo} />
          </View>
        </View>

        <Text style={styles.label}>Giá/giờ (VND) *</Text>
        <TextInput style={styles.input} placeholder="VD: 150000" value={rate}
          onChangeText={setRate} keyboardType="numeric" />

        <Text style={styles.label}>Vị trí dạy *</Text>
        <JobLocationPicker value={location} onChange={setLocation} />

        <Text style={styles.label}>Ghi chú vị trí</Text>
        <TextInput style={styles.input} placeholder="VD: Chung cư Linh Đàm, cổng B2..."
          value={locationNote} onChangeText={setLocationNote} />

        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={submit} disabled={submitting}>
          <Text style={styles.submitText}>{submitting ? 'Đang đăng...' : 'Đăng việc'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.white, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, color: COLORS.text, ...SHADOWS.small,
  },
  textarea: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  half: { width: '48%' },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateChip: {
    backgroundColor: COLORS.primaryLight, borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 8, marginBottom: 8,
  },
  dateChipText: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  pickBtn: {
    borderWidth: 1, borderColor: COLORS.primary, borderStyle: 'dashed',
    borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  pickBtnText: { color: COLORS.primary, fontWeight: '600' },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 24,
  },
  submitText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
});
