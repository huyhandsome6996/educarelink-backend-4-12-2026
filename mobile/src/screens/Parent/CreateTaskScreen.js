import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { createTask } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS } from '../../theme/colors';
import MapPickerModal from '../../components/MapPickerModal';

let DateTimePicker;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

// Sync 100% với web task_create_1.html (Material Symbols → Ionicons)
const CATEGORIES = [
  { id: 1, iconName: 'book', name: 'Gia sư', hint: '150.000đ - 300.000đ/buổi' },
  { id: 2, iconName: 'happy', name: 'Đón trẻ', hint: '80.000đ - 150.000đ/lần' },
  { id: 3, iconName: 'sparkles', name: 'Dọn dẹp', hint: '200.000đ - 400.000đ/ca' },
  { id: 4, iconName: 'people', name: 'Trông trẻ', hint: '100.000đ - 200.000đ/buổi' },
  { id: 5, iconName: 'bag', name: 'Mua sắm hộ', hint: '50.000đ - 100.000đ/lần' },
  { id: 6, iconName: 'restaurant', name: 'Nấu ăn', hint: '100.000đ - 200.000đ/lần' },
  { id: 7, iconName: 'cube', name: 'Chuyển đồ', hint: '150.000đ - 300.000đ/lần' },
  { id: 8, iconName: 'apps', name: 'Khác', hint: 'Thoả thuận' },
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

  const [enableGeofence, setEnableGeofence] = useState(false);
  const [geofenceRadius, setGeofenceRadius] = useState('500');

  // Map picker state — lưu toạ độ đã chọn trên bản đồ
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [pickedCoords, setPickedCoords] = useState(null); // { latitude, longitude, address }

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
      const taskData = {
        category: selectedCat,
        title,
        description,
        location,
        scheduled_time: `${date}T${time}:00+07:00`,
        price: parseInt(price),
      };

      // ===== TỌA ĐỘ TỪ MAP PICKER =====
      // Nếu parent đã chọn vị trí trên bản đồ → gán làm toạ độ task
      // VÀ làm tâm vùng geofence (nếu bật) — đúng semantics: vùng an toàn
      // quanh nơi làm việc, không phải quanh vị trí parent hiện tại.
      if (pickedCoords) {
        taskData.latitude = pickedCoords.latitude;
        taskData.longitude = pickedCoords.longitude;
        if (enableGeofence) {
          taskData.geofence_lat = pickedCoords.latitude;
          taskData.geofence_lng = pickedCoords.longitude;
          taskData.geofence_radius = parseFloat(geofenceRadius) || 500;
        }
      } else if (enableGeofence) {
        // Fallback: nếu parent bật geofence nhưng chưa chọn trên map →
        // xin quyền location và dùng vị trí hiện tại (giữ behaviour cũ)
        try {
          const LocationModule = await import('expo-location');
          const { status } = await LocationModule.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await LocationModule.getCurrentPositionAsync({ accuracy: LocationModule.Accuracy.High });
            taskData.geofence_lat = loc.coords.latitude;
            taskData.geofence_lng = loc.coords.longitude;
            taskData.geofence_radius = parseFloat(geofenceRadius) || 500;
          } else {
            Alert.alert(
              'Cần chọn vị trí trên bản đồ',
              'Bạn chưa chọn vị trí trên bản đồ và chưa cấp quyền vị trí. Hãy bấm "Chọn vị trí trên bản đồ" để chọn, hoặc cấp quyền vị trí để dùng vị trí hiện tại.',
              [
                { text: 'Bỏ qua geofence', onPress: () => { setEnableGeofence(false); } },
              ]
            );
            setIsLoading(false);
            return;
          }
        } catch (e) {
          console.warn('Location permission error:', e);
        }
      }

      await createTask(taskData);
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
              <Ionicons name={c.iconName} size={28} color={selectedCat === c.id ? '#fff' : COLORS.primary} />
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
            <TextInput style={styles.inputInline}
              placeholder="Địa điểm thực hiện *" placeholderTextColor={COLORS.textMuted}
              value={location} onChangeText={setLocation}
              onFocus={() => setLocationFocused(true)} onBlur={() => setLocationFocused(false)} />
            <TouchableOpacity
              style={styles.mapPickerBtn}
              onPress={() => setShowMapPicker(true)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Chọn vị trí trên bản đồ"
            >
              <Ionicons name="map-outline" size={20} color={COLORS.primary} />
              <Text style={styles.mapPickerBtnText}>Bản đồ</Text>
            </TouchableOpacity>
          </View>
          {pickedCoords && (
            <View style={styles.pickedCoordsInfo}>
              <Ionicons name="location" size={14} color={COLORS.primary} />
              <Text style={styles.pickedCoordsText} numberOfLines={1}>
                {pickedCoords.latitude.toFixed(4)}, {pickedCoords.longitude.toFixed(4)}
                {pickedCoords.address ? ` — ${pickedCoords.address.substring(0, 60)}${pickedCoords.address.length > 60 ? '...' : ''}` : ''}
              </Text>
            </View>
          )}
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
            <TextInput style={styles.priceInput}
              placeholder="0" placeholderTextColor={COLORS.textMuted} value={price} onChangeText={setPrice}
              keyboardType="numeric"
              onFocus={() => setPriceFocused(true)} onBlur={() => setPriceFocused(false)} />
            <Text style={styles.currency}>VNĐ/buổi</Text>
          </View>

          {/* ===== GEOFENCE TOGGLE (VÙNG AN TOÀN) ===== */}
          <TouchableOpacity
            style={[styles.geofenceToggle, enableGeofence && styles.geofenceToggleActive]}
            onPress={() => setEnableGeofence(!enableGeofence)}
            activeOpacity={0.85}
          >
            <View style={[styles.geofenceCheckbox, enableGeofence && styles.geofenceCheckboxActive]}>
              {enableGeofence && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.geofenceToggleTitle}>
                <Ionicons name="shield-checkmark" size={14} color={COLORS.primary} /> Yêu cầu theo dõi vị trí Carepartner
              </Text>
              <Text style={styles.geofenceToggleDesc}>
                Carepartner phải đồng ý chia sẻ vị trí mới được nhận việc. Bạn sẽ nhận chuông cảnh báo khi họ rời vùng an toàn.
              </Text>
            </View>
          </TouchableOpacity>

          {enableGeofence && (
            <View style={styles.geofenceSettings}>
              <Text style={styles.geofenceLabel}>Bán kính vùng an toàn (mét):</Text>
              <View style={styles.inputRow}>
                <Ionicons name="map-outline" size={18} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput style={styles.priceInput}
                  placeholder="500" placeholderTextColor={COLORS.textMuted}
                  value={geofenceRadius} onChangeText={setGeofenceRadius}
                  keyboardType="numeric" />
                <Text style={styles.currency}>mét</Text>
              </View>
              <Text style={styles.geofenceHint}>Khuyến nghị: 300-1000m. Tâm vùng sẽ dùng vị trí hiện tại của bạn.</Text>
            </View>
          )}
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
      <MapPickerModal
        visible={showMapPicker}
        onPick={(coords) => {
          setPickedCoords(coords);
          // Auto-fill location text if empty or update with reverse-geocoded address
          if (coords.address) {
            setLocation(coords.address);
          }
        }}
        onClose={() => setShowMapPicker(false)}
      />
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
  // Map picker button (inside location input row)
  mapPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primaryLight,
    marginLeft: 8,
  },
  mapPickerBtnText: {
    ...TYPO.caption,
    color: COLORS.primary,
    fontWeight: '600',
  },
  // Picked coords info (shown below location input when coords selected)
  pickedCoordsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primaryLight,
  },
  pickedCoordsText: {
    flex: 1,
    ...TYPO.caption,
    color: COLORS.primaryDark || COLORS.primary,
    lineHeight: 18,
  },
  twoCol: { flexDirection: 'row', gap: 12 },
  currency: { ...TYPO.h5, color: COLORS.textSecondary, marginLeft: 8 },
  footer: { padding: 20, paddingBottom: 36, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 54, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, ...SHADOWS.large },
  submitText: { color: '#fff', ...TYPO.button },

  // === GEOFENCE TOGGLE ===
  geofenceToggle: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusSm,
    borderWidth: 1.5, borderColor: COLORS.border, padding: 14,
    marginTop: 8,
  },
  geofenceToggleActive: {
    borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight,
  },
  geofenceCheckbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 2,
  },
  geofenceCheckboxActive: {
    backgroundColor: COLORS.primary, borderColor: COLORS.primary,
  },
  geofenceToggleTitle: {
    ...TYPO.bodySmall, color: COLORS.textPrimary, fontWeight: '700', marginBottom: 4,
  },
  geofenceToggleDesc: {
    ...TYPO.caption, color: COLORS.textSecondary, lineHeight: 18,
  },
  geofenceSettings: {
    marginTop: 10, gap: 8,
  },
  geofenceLabel: {
    ...TYPO.overline, color: COLORS.textMuted, fontWeight: '700',
  },
  geofenceHint: {
    ...TYPO.caption, color: COLORS.textMuted, fontStyle: 'italic',
  },
});
