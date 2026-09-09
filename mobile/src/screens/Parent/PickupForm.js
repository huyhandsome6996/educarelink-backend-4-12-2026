// ============================================================
// PickupForm — Flow 1 Step 1 §C: Đăng việc ĐÓN TRẺ
// school_or_pickup_place_name + destination_type (parent_home /
// other_address) + pickup_location + destination_location
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

// 3 phương thức đưa đón chuẩn theo đặc tả Mục 2 (job_schema.TRANSPORT_METHODS)
const TRANSPORT_METHODS = [
  { code: 'walking', label: 'Đi bộ' },
  { code: 'carepartner_vehicle', label: 'CP tự có xe' },
  { code: 'parent_arranged', label: 'Phụ huynh sắp xếp' },
];

export default function PickupForm() {
  const navigation = useNavigation();
  const [schoolName, setSchoolName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [numChildren, setNumChildren] = useState('1');
  const [dates, setDates] = useState([]);
  const [timeFrom, setTimeFrom] = useState('16:30');
  const [timeTo, setTimeTo] = useState('17:30');
  const [pickupLocation, setPickupLocation] = useState(null);
  const [pickupNote, setPickupNote] = useState('');
  const [destType, setDestType] = useState('parent_home');
  const [destLocation, setDestLocation] = useState(null);
  const [destNote, setDestNote] = useState('');
  const [transportMethod, setTransportMethod] = useState('');
  const [transportNote, setTransportNote] = useState('');
  const [requirements, setRequirements] = useState('');
  const [rate, setRate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addDate = (_e, selected) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (!selected) return;
    const iso = selected.toISOString().slice(0, 10);
    if (iso < new Date().toISOString().slice(0, 10))
      return Alert.alert('Không hợp lệ', 'Không được chọn ngày trong quá khứ.');
    if (!dates.includes(iso)) setDates([...dates, iso].sort());
  };

  const submit = async () => {
    if (!schoolName.trim())
      return Alert.alert('Thiếu thông tin', 'Nhập tên trường / điểm đón.');
    if (!ageGroup) return Alert.alert('Thiếu thông tin', 'Chọn độ tuổi của trẻ.');
    if (dates.length === 0) return Alert.alert('Thiếu thông tin', 'Chọn ngày đón.');
    if (!pickupLocation) return Alert.alert('Thiếu thông tin', 'Chọn điểm đón trên bản đồ.');
    if (destType === 'other_address' && !destLocation)
      return Alert.alert('Thiếu thông tin', 'Chọn điểm đến trên bản đồ (địa chỉ khác).');
    if (!requirements.trim()) return Alert.alert('Thiếu thông tin', 'Nhập yêu cầu cụ thể.');
    if (!rate || Number(rate) <= 0) return Alert.alert('Thiếu thông tin', 'Nhập giá/giờ hợp lệ.');

    setSubmitting(true);
    try {
      const { data: job } = await createJob({
        job_type: 'pickup',
        school_or_pickup_place_name: schoolName.trim(),
        child_age_group: ageGroup,
        number_of_children: Number(numChildren),
        pickup_dates: dates,
        pickup_time_from: timeFrom,
        pickup_time_to: timeTo,
        pickup_location: pickupLocation,
        pickup_location_note: pickupNote,
        destination_type: destType,
        destination_location: destType === 'other_address' ? destLocation : null,
        destination_note: destNote,
        transport_method: transportMethod || undefined,
        transport_note: transportNote,
        specific_requirements: requirements.trim(),
        // vị trí chính = điểm đón
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude,
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
        <Text style={styles.label}>Tên trường / điểm đón *</Text>
        <TextInput style={styles.input} placeholder="VD: Tiểu học Nguyễn Văn Cừ"
          value={schoolName} onChangeText={setSchoolName} />

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

        <Text style={styles.label}>Ngày đón *</Text>
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
            <Text style={styles.label}>Giờ đón *</Text>
            <TextInput style={styles.input} value={timeFrom} onChangeText={setTimeFrom} />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Đến giờ *</Text>
            <TextInput style={styles.input} value={timeTo} onChangeText={setTimeTo} />
          </View>
        </View>

        <Text style={styles.label}>Điểm đón *</Text>
        <JobLocationPicker value={pickupLocation} onChange={setPickupLocation} />
        <TextInput style={[styles.input, { marginTop: 8 }]}
          placeholder="Ghi chú điểm đón (cổng trường, góc phố...)"
          value={pickupNote} onChangeText={setPickupNote} />

        <Text style={styles.label}>Điểm đến *</Text>
        <View style={styles.chipWrap}>
          <TouchableOpacity style={[styles.chip, destType === 'parent_home' && styles.chipActive]}
            onPress={() => setDestType('parent_home')}>
            <Text style={[styles.chipText, destType === 'parent_home' && styles.chipTextActive]}>
              Về nhà
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, destType === 'other_address' && styles.chipActive]}
            onPress={() => setDestType('other_address')}>
            <Text style={[styles.chipText, destType === 'other_address' && styles.chipTextActive]}>
              Địa chỉ khác
            </Text>
          </TouchableOpacity>
        </View>
        {destType === 'other_address' && (
          <>
            <JobLocationPicker value={destLocation} onChange={setDestLocation} />
            <TextInput style={[styles.input, { marginTop: 8 }]}
              placeholder="Ghi chú điểm đến" value={destNote} onChangeText={setDestNote} />
          </>
        )}

        <Text style={styles.label}>Phương tiện đưa đón (tuỳ chọn)</Text>
        <View style={styles.chipWrap}>
          {TRANSPORT_METHODS.map((t) => (
            <TouchableOpacity key={t.code}
              style={[styles.chip, transportMethod === t.code && styles.chipActive]}
              onPress={() => setTransportMethod(transportMethod === t.code ? '' : t.code)}>
              <Text style={[styles.chipText, transportMethod === t.code && styles.chipTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={[styles.input, { marginTop: 4 }]}
          placeholder="Ghi chú thêm về phương tiện (nếu có)…"
          value={transportNote} onChangeText={setTransportNote} />

        <Text style={styles.label}>Yêu cầu cụ thể *</Text>
        <TextInput style={[styles.input, styles.textarea]}
          placeholder="VD: đón bé lớp 1, nắm tay qua đường..."
          value={requirements} onChangeText={setRequirements} multiline />

        <Text style={styles.label}>Giá/giờ (VND) *</Text>
        <TextInput style={styles.input} placeholder="VD: 90000" value={rate}
          onChangeText={setRate} keyboardType="numeric" />

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
