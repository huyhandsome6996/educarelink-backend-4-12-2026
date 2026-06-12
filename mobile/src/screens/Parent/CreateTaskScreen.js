import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { createTask } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS } from '../../theme/colors';

let DateTimePicker;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

const CATEGORIES = [
  { id: 1, icon: require('../../../assets/images/icon_tutoring.png'), name: 'Gia sư', hint: '150.000đ - 300.000đ/buổi' },
  { id: 2, icon: require('../../../assets/images/icon_pickup.png'), name: 'Đón trẻ', hint: '80.000đ - 150.000đ/lần' },
  { id: 3, icon: require('../../../assets/images/icon_cleaning.png'), name: 'Dọn dẹp', hint: '200.000đ - 400.000đ/ca' },
  { id: 4, icon: require('../../../assets/images/icon_babysitting.png'), name: 'Trông trẻ', hint: '100.000đ - 200.000đ/buổi' },
  { id: 5, icon: require('../../../assets/images/icon_shopping.png'), name: 'Mua sắm hộ', hint: '50.000đ - 100.000đ/lần' },
  { id: 6, icon: require('../../../assets/images/icon_cooking.png'), name: 'Nấu ăn', hint: '100.000đ - 200.000đ/lần' },
  { id: 7, icon: require('../../../assets/images/icon_moving.png'), name: 'Chuyển đồ', hint: '150.000đ - 300.000đ/lần' },
  { id: 8, icon: require('../../../assets/images/icon_other.png'), name: 'Khác', hint: 'Thoả thuận' },
];

export default function CreateTaskScreen() {
  const navigation = useNavigation();
  const [selectedCat, setSelectedCat] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [price, setPrice] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [dateValue, setDateValue] = useState(new Date());
  const [timeValue, setTimeValue] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Focus state tracking for inputs (taste-skill: visible focus rings)
  const [titleFocused, setTitleFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);
  const [locationFocused, setLocationFocused] = useState(false);
  const [priceFocused, setPriceFocused] = useState(false);

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setDateValue(selectedDate);
      const yyyy = selectedDate.getFullYear();
      const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const dd = String(selectedDate.getDate()).padStart(2, '0');
      setDate(`${yyyy}-${mm}-${dd}`);
    }
  };

  const onTimeChange = (event, selectedTime) => {
    setShowTimePicker(false);
    if (selectedTime) {
      setTimeValue(selectedTime);
      const hh = String(selectedTime.getHours()).padStart(2, '0');
      const min = String(selectedTime.getMinutes()).padStart(2, '0');
      setTime(`${hh}:${min}`);
    }
  };

  const handleOpenDatePicker = () => {
    if (Platform.OS === 'web') {
      const val = prompt('Nhập ngày (YYYY-MM-DD):', date || '2026-05-29');
      if (val) setDate(val);
    } else {
      setShowDatePicker(true);
    }
  };

  const handleOpenTimePicker = () => {
    if (Platform.OS === 'web') {
      const val = prompt('Nhập giờ (HH:MM):', time || '12:00');
      if (val) setTime(val);
    } else {
      setShowTimePicker(true);
    }
  };

  const cat = CATEGORIES.find(c => c.id === selectedCat);

  const handleSubmit = async () => {
    if (!title || !description || !location || !date || !time || !price) {
      Alert.alert('Thiếu thông tin', 'Vui lòng điền đầy đủ tất cả các trường.');
      return;
    }
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!dateRegex.test(date) || !timeRegex.test(time)) {
      Alert.alert('Sai định dạng', 'Ngày phải là YYYY-MM-DD, giờ phải là HH:MM');
      return;
    }

    setIsLoading(true);
    try {
      await createTask({
        category: selectedCat,
        title,
        description,
        location,
        scheduled_time: `${date}T${time}:00+07:00`,
        price: parseInt(price),
      });
      Alert.alert('✅ Thành công!', 'Đã đăng việc lên cộng đồng.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      const data = error.response?.data;
      const msg = typeof data === 'object' ? JSON.stringify(data) : 'Đăng việc thất bại.';
      Alert.alert('Lỗi', msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="close" size={22} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Đăng việc mới</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Chọn danh mục */}
        <Text style={styles.label}>Chọn loại dịch vụ</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catsScroll}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity key={c.id} style={[styles.catBtn, selectedCat === c.id && styles.catBtnActive]}
              onPress={() => setSelectedCat(c.id)} activeOpacity={0.8}>
              <Image source={c.icon} style={styles.catImage} resizeMode="contain" />
              <Text style={[styles.catName, selectedCat === c.id && styles.catNameActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Gợi ý giá */}
        <View style={styles.priceHint}>
          <Ionicons name="bulb-outline" size={14} color={COLORS.primary} />
          <Text style={styles.priceHintText}>Gợi ý mức giá cho {cat?.name}: {cat?.hint}</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput style={[styles.input, titleFocused && styles.inputFocused]}
            placeholder="Tiêu đề công việc *" placeholderTextColor={COLORS.textMuted}
            value={title} onChangeText={setTitle}
            onFocus={() => setTitleFocused(true)} onBlur={() => setTitleFocused(false)} />
          <TextInput style={[styles.input, styles.textarea, descFocused && styles.inputFocused]}
            placeholder="Mô tả chi tiết yêu cầu *"
            placeholderTextColor={COLORS.textMuted} value={description} onChangeText={setDescription}
            multiline numberOfLines={4} textAlignVertical="top"
            onFocus={() => setDescFocused(true)} onBlur={() => setDescFocused(false)} />
          <View style={[styles.inputRow, locationFocused && styles.inputRowFocused]}>
            <Ionicons name="location-outline" size={18} color={COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput style={[styles.inputInline]}
              placeholder="Địa điểm thực hiện *" placeholderTextColor={COLORS.textMuted}
              value={location} onChangeText={setLocation}
              onFocus={() => setLocationFocused(true)} onBlur={() => setLocationFocused(false)} />
          </View>
          <View style={styles.twoCol}>
            <TouchableOpacity style={[styles.input, { flex: 1, justifyContent: 'center' }]} onPress={handleOpenDatePicker}>
              <Text style={{ ...TYPO.body, color: date ? COLORS.textPrimary : COLORS.textMuted }}>
                {date ? date : 'Chọn ngày'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.input, { flex: 1, justifyContent: 'center' }]} onPress={handleOpenTimePicker}>
              <Text style={{ ...TYPO.body, color: time ? COLORS.textPrimary : COLORS.textMuted }}>
                {time ? time : 'Chọn giờ'}
              </Text>
            </TouchableOpacity>
          </View>

          {showDatePicker && DateTimePicker && (
            <DateTimePicker
              value={dateValue}
              mode="date"
              display="default"
              onChange={onDateChange}
              minimumDate={new Date()}
            />
          )}

          {showTimePicker && DateTimePicker && (
            <DateTimePicker
              value={timeValue}
              mode="time"
              is24Hour={true}
              display="default"
              onChange={onTimeChange}
            />
          )}
          <View style={[styles.inputRow, priceFocused && styles.inputRowFocused]}>
            <TextInput style={[styles.priceInput]}
              placeholder="0" placeholderTextColor={COLORS.textMuted} value={price} onChangeText={setPrice}
              keyboardType="numeric"
              onFocus={() => setPriceFocused(true)} onBlur={() => setPriceFocused(false)} />
            <Text style={styles.currency}>VNĐ/buổi</Text>
          </View>
        </View>
      </ScrollView>

      {/* Submit button */}
      <View style={styles.footer}>
        <TouchableOpacity style={[styles.submitBtn, isLoading && { opacity: 0.7 }]}
          onPress={handleSubmit} disabled={isLoading} activeOpacity={0.85}>
          {isLoading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.submitText}>Đăng lên cộng đồng</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SIZES.md, paddingTop: 56, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { width: 40, height: 40, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '800' },
  body: { flex: 1, padding: 20 },
  label: { ...TYPO.overline, color: COLORS.textSecondary, marginBottom: 10 },
  catsScroll: { marginBottom: 12 },
  catBtn: { alignItems: 'center', padding: 12, borderRadius: SIZES.radiusMd, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface, marginRight: 10, minWidth: 76 },
  catBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15', ...SHADOWS.cardHover, transform: [{ scale: 1.03 }] },
  catImage: { width: 32, height: 32, marginBottom: 6 },
  catName: { ...TYPO.bodySmall, color: COLORS.textSecondary },
  catNameActive: { color: COLORS.primary, fontWeight: '700' },
  priceHint: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusSm, padding: 10, marginBottom: 20, borderWidth: 1, borderColor: COLORS.primarySoft },
  priceHintText: { flex: 1, ...TYPO.bodySmall, color: COLORS.primaryDark, fontWeight: '500' },
  form: { gap: 12 },
  input: { backgroundColor: COLORS.surface, borderRadius: SIZES.radiusSm, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 16, paddingVertical: 12, ...TYPO.body, color: COLORS.textPrimary, marginBottom: 0 },
  inputFocused: { ...FRAGMENTS.inputFocus, ...SHADOWS.inputFocus },
  textarea: { minHeight: 100, paddingTop: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: SIZES.radiusSm, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 16, minHeight: 54 },
  inputRowFocused: { ...FRAGMENTS.inputFocus, ...SHADOWS.inputFocus },
  inputInline: { flex: 1, ...TYPO.body, color: COLORS.textPrimary, paddingVertical: 0 },
  priceInput: { flex: 1, ...TYPO.h3, color: COLORS.primary, fontWeight: '700', paddingVertical: 0 },
  inputIcon: { marginRight: 8 },
  twoCol: { flexDirection: 'row', gap: 12 },
  currency: { ...TYPO.h5, color: COLORS.textSecondary, marginLeft: 8 },
  footer: { padding: 20, paddingBottom: 36, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 54, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, ...SHADOWS.large },
  submitText: { color: '#fff', ...TYPO.button },
});
