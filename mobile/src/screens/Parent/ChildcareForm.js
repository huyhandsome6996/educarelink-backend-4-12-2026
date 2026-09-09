// ============================================================
// ChildcareForm — Flow 1 Step 1 §B: Đăng việc TRÔNG TRẺ
// child_age_group + number_of_children + care_duties (multi-select)
// + medical_allergy_notes + specific_requirements + dates/time/location
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Alert, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
import { createJob, publishJob } from '../../api/matching';
import JobLocationPicker from '../../components/JobLocationPicker';

let DateTimePicker;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

// 5 nhóm tuổi chuẩn theo đặc tả Mục 2 (backend job_schema.CHILD_AGE_GROUPS)
const AGE_GROUPS = [
  { code: '0_to_12_months', label: '0 - 12 tháng tuổi' },
  { code: '1_to_3_years', label: '1 - 3 tuổi' },
  { code: '3_to_6_years', label: '3 - 6 tuổi' },
  { code: '6_to_10_years', label: '6 - 10 tuổi' },
  { code: 'over_10_years', label: 'Trên 10 tuổi' },
];

// 7 việc chăm sóc trẻ chuẩn theo đặc tả Mục 2 (backend job_schema.CARE_DUTIES)
const DUTIES = [
  { code: 'general_care', label: 'Chăm sóc chung' },
  { code: 'feeding', label: 'Cho ăn' },
  { code: 'bathing', label: 'Tắm rửa' },
  { code: 'sleep_monitoring', label: 'Trông ngủ' },
  { code: 'play_activities', label: 'Vui chơi & hoạt động' },
  { code: 'homework_help', label: 'Hỗ trợ bài tập về nhà' },
  { code: 'light_chores', label: 'Việc nhẹ liên quan bé' },
];

export default function ChildcareForm() {
  const navigation = useNavigation();
  const [ageGroup, setAgeGroup] = useState('');
  const [numChildren, setNumChildren] = useState('1');
  const [duties, setDuties] = useState([]);
  const [allergyNotes, setAllergyNotes] = useState('');
  const [requirements, setRequirements] = useState('');
  const [dates, setDates] = useState([]);
  const [timeFrom, setTimeFrom] = useState('08:00');
  const [timeTo, setTimeTo] = useState('17:00');
  const [rate, setRate] = useState('');
  const [location, setLocation] = useState(null);
  const [locationNote, setLocationNote] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleDuty = (code) => setDuties((prev) =>
    prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]);

  const addDate = (_e, selected) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (!selected) return;
    const iso = selected.toISOString().slice(0, 10);
    if (iso < new Date().toISOString().slice(0, 10))
      return Alert.alert('Không hợp lệ', 'Không được chọn ngày trong quá khứ.');
    if (!dates.includes(iso)) setDates([...dates, iso].sort());
  };

  const submit = async () => {
    if (!ageGroup) return Alert.alert('Thiếu thông tin', 'Chọn độ tuổi của trẻ.');
    if (Number(numChildren) < 1) return Alert.alert('Thiếu thông tin', 'Số lượng trẻ >= 1.');
    if (duties.length === 0) return Alert.alert('Thiếu thông tin', 'Chọn ít nhất 1 việc chăm sóc.');
    if (!requirements.trim()) return Alert.alert('Thiếu thông tin', 'Nhập yêu cầu cụ thể.');
    if (dates.length === 0) return Alert.alert('Thiếu thông tin', 'Chọn ngày làm việc.');
    if (!location) return Alert.alert('Thiếu thông tin', 'Chọn vị trí trên bản đồ.');
    if (!rate || Number(rate) <= 0) return Alert.alert('Thiếu thông tin', 'Nhập giá/giờ hợp lệ.');

    setSubmitting(true);
    try {
      const { data: job } = await createJob({
        job_type: 'childcare',
        child_age_group: ageGroup,
        number_of_children: Number(numChildren),
        care_duties: duties,
        medical_allergy_notes: allergyNotes.trim(),
        specific_requirements: requirements.trim(),
        dates,
        time_from: timeFrom,
        time_to: timeTo,
        latitude: location.latitude,
        longitude: location.longitude,
        location_note: locationNote,
        hourly_rate_vnd: Number(rate),
      });
      const { data: published } = await publishJob(job.id);
      Alert.alert('Đã đăng bài', 'Hệ thống đang tìm CarePartner phù hợp.',
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
        <Text style={styles.label}>Độ tuổi của trẻ *</Text>
        <View style={styles.chipWrap}>
          {AGE_GROUPS.map((g) => (
            <TouchableOpacity key={g.code}
              style={[styles.chip, ageGroup === g.code && styles.chipActive]}
              onPress={() => setAgeGroup(g.code)}>
              <Text style={[styles.chipText, ageGroup === g.code && styles.chipTextActive]}>
                {g.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Số lượng trẻ *</Text>
        <TextInput style={styles.input} value={numChildren} onChangeText={setNumChildren}
          keyboardType="numeric" />

        <Text style={styles.label}>Việc cần chăm sóc * (chọn nhiều)</Text>
        <View style={styles.chipWrap}>
          {DUTIES.map((d) => (
            <TouchableOpacity key={d.code}
              style={[styles.chip, duties.includes(d.code) && styles.chipActive]}
              onPress={() => toggleDuty(d.code)}>
              <Text style={[styles.chipText, duties.includes(d.code) && styles.chipTextActive]}>
                {d.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Ghi chú y tế / dị ứng</Text>
        <TextInput style={[styles.input, styles.textarea]}
          placeholder="VD: bé dị ứng hải sản..." value={allergyNotes}
          onChangeText={setAllergyNotes} multiline />

        <Text style={styles.label}>Yêu cầu cụ thể *</Text>
        <TextInput style={[styles.input, styles.textarea]}
          placeholder="VD: biết nấu cháo, có kinh nghiệm mầm non..."
          value={requirements} onChangeText={setRequirements} multiline />

        <Text style={styles.label}>Ngày làm việc *</Text>
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
            <TextInput style={styles.input} value={timeFrom} onChangeText={setTimeFrom} />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Đến *</Text>
            <TextInput style={styles.input} value={timeTo} onChangeText={setTimeTo} />
          </View>
        </View>

        <Text style={styles.label}>Giá/giờ (VND) *</Text>
        <TextInput style={styles.input} placeholder="VD: 120000" value={rate}
          onChangeText={setRate} keyboardType="numeric" />

        <Text style={styles.label}>Vị trí làm việc *</Text>
        <JobLocationPicker value={location} onChange={setLocation} />

        <Text style={styles.label}>Ghi chú vị trí</Text>
        <TextInput style={styles.input} placeholder="VD: Toà A, nhập cổng sau..."
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
  label: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.white, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, color: COLORS.textPrimary,
    borderWidth: 1, borderColor: COLORS.divider, ...SHADOWS.small,
  },
  textarea: { height: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  half: { width: '48%' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.divider,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primaryDark },
  chipText: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: COLORS.white, fontWeight: '700' },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateChip: {
    backgroundColor: COLORS.primaryLight, borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 8, marginBottom: 8,
  },
  dateChipText: { color: COLORS.primaryDeep, fontWeight: '700', fontSize: 13 },
  pickBtn: {
    borderWidth: 1.5, borderColor: COLORS.primary, borderStyle: 'dashed',
    borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: COLORS.primaryLight,
  },
  pickBtnText: { color: COLORS.primaryDeep, fontWeight: '700' },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 24,
  },
  submitText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
});
