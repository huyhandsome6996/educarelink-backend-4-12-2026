import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { createTask } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
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

// Progress stepper steps (visual only — no state added, single-screen form)
const STEPS = [
  { id: 1, label: 'Loại việc' },
  { id: 2, label: 'Chi tiết' },
  { id: 3, label: 'Xác nhận' },
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
              'Bạn chưa chọn vị trí trên bản đồ và chưa cấp quyền vị trí. Hãy bấm "Chọn trên bản đồ" để chọn, hoặc cấp quyền vị trí để dùng vị trí hiện tại.',
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

  // ===== Helper render for stepper =====
  const renderStep = (step, isActive, isCompleted) => (
    <View style={styles.stepWrap}>
      <View style={[styles.stepCircle, isActive ? styles.stepActive : styles.stepInactive]}>
        {isCompleted ? (
          <Ionicons name="checkmark" size={16} color={COLORS.textOnPrimary} />
        ) : (
          <Text style={[styles.stepText, isActive ? styles.stepTextActive : styles.stepTextInactive]}>
            {step.id}
          </Text>
        )}
      </View>
      <Text style={[styles.stepLabel, isActive ? styles.stepLabelActive : styles.stepLabelInactive]}>
        {step.label}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" />

      {/* ===== Top App Bar (Warm Professionalism) ===== */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tạo yêu cầu mới</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ===== Progress Stepper (3 steps, visual only) ===== */}
        <View style={styles.stepper}>
          {renderStep(STEPS[0], true, false)}
          <View style={styles.stepLine}>
            <View style={[styles.stepLineFill, { width: '0%' }]} />
          </View>
          {renderStep(STEPS[1], false, false)}
          <View style={styles.stepLine} />
          {renderStep(STEPS[2], false, false)}
        </View>

        {/* ===== Section: Loại dịch vụ (chip selector) ===== */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Loại dịch vụ</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => {
              const active = selectedCat === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSelectedCat(c.id)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={c.iconName}
                    size={14}
                    color={active ? COLORS.textOnPrimary : COLORS.primary}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* Price hint */}
          <View style={styles.priceHint}>
            <Ionicons name="bulb-outline" size={14} color={COLORS.primary} />
            <Text style={styles.priceHintText}>Gợi ý: {cat?.hint}</Text>
          </View>
        </View>

        {/* ===== Section: Tiêu đề ===== */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Tiêu đề</Text>
          <View style={[styles.inputCard, titleFocused && styles.inputCardFocused]}>
            <Ionicons name="create-outline" size={18} color={COLORS.primary} style={styles.inputIcon} />
            <TextInput
              style={styles.inputInline}
              placeholder="VD: Đón bé ở trường chiều nay"
              placeholderTextColor={COLORS.textMuted}
              value={title}
              onChangeText={setTitle}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => setTitleFocused(false)}
            />
          </View>
        </View>

        {/* ===== Section: Mô tả chi tiết ===== */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Mô tả chi tiết</Text>
          <View style={[styles.inputCard, styles.textareaCard, descFocused && styles.inputCardFocused]}>
            <TextInput
              style={styles.textarea}
              placeholder="Mô tả yêu cầu, thời gian, lưu ý đặc biệt..."
              placeholderTextColor={COLORS.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              onFocus={() => setDescFocused(true)}
              onBlur={() => setDescFocused(false)}
            />
          </View>
        </View>

        {/* ===== Section: Thời gian (date + time, 2-col grid) ===== */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Thời gian</Text>
          <View style={styles.twoCol}>
            <TouchableOpacity
              style={styles.dtCard}
              onPress={handleOpenDatePicker}
              activeOpacity={0.7}
            >
              <Text style={styles.dtCaption}>Ngày</Text>
              <View style={styles.dtRow}>
                <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
                <Text style={[styles.dtValue, !date && styles.dtPlaceholder]} numberOfLines={1}>
                  {date || 'Chọn ngày'}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dtCard}
              onPress={handleOpenTimePicker}
              activeOpacity={0.7}
            >
              <Text style={styles.dtCaption}>Giờ</Text>
              <View style={styles.dtRow}>
                <Ionicons name="time-outline" size={16} color={COLORS.primary} />
                <Text style={[styles.dtValue, !time && styles.dtPlaceholder]} numberOfLines={1}>
                  {time || 'Chọn giờ'}
                </Text>
              </View>
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
        </View>

        {/* ===== Section: Địa điểm (with map picker) ===== */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Địa điểm</Text>
            <TouchableOpacity
              onPress={() => setShowMapPicker(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.sectionAction}>Chọn trên bản đồ</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.inputCard, locationFocused && styles.inputCardFocused]}>
            <Ionicons name="location-outline" size={18} color={COLORS.primary} style={styles.inputIcon} />
            <TextInput
              style={styles.inputInline}
              placeholder="VD: Trường Tiểu học Nguyễn Du"
              placeholderTextColor={COLORS.textMuted}
              value={location}
              onChangeText={setLocation}
              onFocus={() => setLocationFocused(true)}
              onBlur={() => setLocationFocused(false)}
            />
            <TouchableOpacity
              style={styles.mapBtn}
              onPress={() => setShowMapPicker(true)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Chọn vị trí trên bản đồ"
            >
              <Ionicons name="map-outline" size={16} color={COLORS.primary} />
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
        </View>

        {/* ===== Section: Mức thù lao ===== */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Mức thù lao</Text>
          <View style={[styles.inputCard, priceFocused && styles.inputCardFocused]}>
            <Ionicons name="cash-outline" size={18} color={COLORS.primary} style={styles.inputIcon} />
            <TextInput
              style={styles.priceInput}
              placeholder="0"
              placeholderTextColor={COLORS.textMuted}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              onFocus={() => setPriceFocused(true)}
              onBlur={() => setPriceFocused(false)}
            />
            <Text style={styles.currency}>VNĐ</Text>
          </View>
        </View>

        {/* ===== Section: Vùng an toàn (Geofence) ===== */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.geofenceToggle, enableGeofence && styles.geofenceToggleActive]}
            onPress={() => setEnableGeofence(!enableGeofence)}
            activeOpacity={0.85}
          >
            <View style={[styles.geofenceCheckbox, enableGeofence && styles.geofenceCheckboxActive]}>
              {enableGeofence && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.geofenceTitleRow}>
                <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.primary} />
                <Text style={styles.geofenceToggleTitle}>Yêu cầu theo dõi vị trí Carepartner</Text>
              </View>
              <Text style={styles.geofenceToggleDesc}>
                Carepartner phải đồng ý chia sẻ vị trí mới được nhận việc. Bạn sẽ nhận chuông cảnh báo khi họ rời vùng an toàn.
              </Text>
            </View>
          </TouchableOpacity>

          {enableGeofence && (
            <View style={styles.geofenceSettings}>
              <Text style={styles.geofenceLabel}>Bán kính vùng an toàn (mét):</Text>
              <View style={[styles.inputCard, styles.geofenceRadiusRow]}>
                <Ionicons name="map-outline" size={18} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.priceInput}
                  placeholder="500"
                  placeholderTextColor={COLORS.textMuted}
                  value={geofenceRadius}
                  onChangeText={setGeofenceRadius}
                  keyboardType="numeric"
                />
                <Text style={styles.currency}>mét</Text>
              </View>
              <Text style={styles.geofenceHint}>
                Khuyến nghị: 300-1000m. Tâm vùng sẽ dùng toạ độ đã chọn trên bản đồ, hoặc vị trí hiện tại của bạn nếu chưa chọn.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ===== Sticky footer with primary CTA ===== */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, isLoading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.submitText}>Đăng lên cộng đồng</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ===== Top App Bar =====
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.marginMobile,
    paddingTop: 56,
    paddingBottom: SIZES.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant + '80',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: SIZES.radiusFull,
    backgroundColor: COLORS.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...TYPO.h3,
    color: COLORS.textPrimary,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },

  // ===== Body =====
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: SIZES.marginMobile,
    paddingTop: SIZES.md,
    paddingBottom: 140,
    gap: SIZES.lg,
  },

  // ===== Progress Stepper =====
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SIZES.sm,
  },
  stepWrap: {
    alignItems: 'center',
    gap: SIZES.xs,
    zIndex: 2,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: SIZES.radiusFull,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepActive: {
    backgroundColor: COLORS.primary,
    ...SHADOWS.cardHover,
  },
  stepInactive: {
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant + '60',
  },
  stepText: {
    ...TYPO.caption,
  },
  stepTextActive: {
    color: COLORS.textOnPrimary,
  },
  stepTextInactive: {
    color: COLORS.textSecondary,
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  stepLabelActive: {
    color: COLORS.primaryText,
  },
  stepLabelInactive: {
    color: COLORS.textMuted,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.outlineVariant + '70',
    marginHorizontal: -SIZES.xs,
    borderRadius: 1,
    zIndex: 1,
  },
  stepLineFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: COLORS.primary,
    borderRadius: 1,
  },

  // ===== Sections =====
  section: {
    gap: SIZES.sm,
  },
  sectionLabel: {
    ...TYPO.h4,
    color: COLORS.textPrimary,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionAction: {
    ...TYPO.caption,
    color: COLORS.primary,
  },

  // ===== Chips (service type) =====
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.md,
    paddingVertical: 8,
    borderRadius: SIZES.radiusFull,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    ...SHADOWS.cardHover,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.1,
    color: COLORS.textPrimary,
  },
  chipTextActive: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },
  priceHint: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    borderRadius: SIZES.radiusSm,
    paddingHorizontal: SIZES.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
    marginTop: SIZES.xs,
  },
  priceHintText: {
    flex: 1,
    ...TYPO.bodySmall,
    color: COLORS.primaryText,
  },

  // ===== Inputs (card-style, rounded 14) =====
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    paddingHorizontal: SIZES.md,
    minHeight: 54,
  },
  inputCardFocused: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
    ...SHADOWS.inputFocus,
  },
  inputIcon: {
    marginRight: SIZES.sm,
  },
  inputInline: {
    flex: 1,
    ...TYPO.body,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  textareaCard: {
    alignItems: 'stretch',
    paddingVertical: SIZES.sm,
    minHeight: 110,
  },
  textarea: {
    flex: 1,
    ...TYPO.body,
    color: COLORS.textPrimary,
    paddingVertical: 0,
    minHeight: 90,
    textAlignVertical: 'top',
  },

  // ===== Date / Time grid =====
  twoCol: {
    flexDirection: 'row',
    gap: SIZES.md,
  },
  dtCard: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    paddingHorizontal: SIZES.md,
    paddingVertical: 12,
    gap: 4,
    minHeight: 64,
    justifyContent: 'center',
  },
  dtCaption: {
    ...TYPO.caption,
    color: COLORS.textSecondary,
  },
  dtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
  },
  dtValue: {
    ...TYPO.body,
    color: COLORS.textPrimary,
    flex: 1,
  },
  dtPlaceholder: {
    color: COLORS.textMuted,
  },

  // ===== Map picker =====
  mapBtn: {
    width: 36,
    height: 36,
    borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SIZES.xs,
  },
  pickedCoordsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SIZES.xs,
    paddingHorizontal: SIZES.md,
    paddingVertical: 8,
    borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primaryLight,
  },
  pickedCoordsText: {
    flex: 1,
    ...TYPO.caption,
    color: COLORS.primaryText,
    lineHeight: 18,
  },

  // ===== Price input =====
  priceInput: {
    flex: 1,
    ...TYPO.h3,
    color: COLORS.primary,
    fontWeight: '700',
    paddingVertical: 0,
  },
  currency: {
    ...TYPO.h5,
    color: COLORS.textSecondary,
    marginLeft: SIZES.sm,
  },

  // ===== Geofence toggle =====
  geofenceToggle: {
    flexDirection: 'row',
    gap: SIZES.md,
    alignItems: 'flex-start',
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: SIZES.radiusLg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    padding: SIZES.md,
  },
  geofenceToggleActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  geofenceCheckbox: {
    width: 22,
    height: 22,
    borderRadius: SIZES.radiusSm,
    borderWidth: 2,
    borderColor: COLORS.outlineVariant,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  geofenceCheckboxActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  geofenceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  geofenceToggleTitle: {
    ...TYPO.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  geofenceToggleDesc: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  geofenceSettings: {
    marginTop: SIZES.sm,
    gap: SIZES.sm,
  },
  geofenceRadiusRow: {
    minHeight: 50,
  },
  geofenceLabel: {
    ...TYPO.caption,
    color: COLORS.textSecondary,
  },
  geofenceHint: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // ===== Sticky footer =====
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SIZES.marginMobile,
    paddingTop: SIZES.md,
    paddingBottom: 36,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant + '70',
    ...SHADOWS.medium,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radiusMd,
    height: 56,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SIZES.sm,
    ...SHADOWS.large,
  },
  submitText: {
    color: COLORS.textOnPrimary,
    ...TYPO.h4,
  },
});
