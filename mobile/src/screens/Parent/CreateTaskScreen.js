// ============================================================
// CreateTaskScreen — Redesign theo Warm Professionalism (Stitch AI)
// Thay đổi:
// - Top App Bar: trắng, back arrow + 'Tạo yêu cầu mới' + spacer
// - Progress stepper (cosmetic): 3 bước, bước 1 active primary-container
// - Service chips: pill style (active = primary-container bg, trắng text)
// - Form: bọc trong các section với caption label trên input
// - Input: border outline-variant, radius 14, focus ring primary-container
// - Geofence section: card với border, toggle checkmark
// - Sticky footer: price hint card + 'Đăng lên cộng đồng' button
//   (shadow cam đậm)
// - Background: surfaceWarm
// Giữ nguyên: logic submit, validation, date/time pickers, geofence
// permission flow, 8 categories, AI moderation message
// ============================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Animated} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { createTask, getPriceSuggestion, getCategories } from '../../api/tasks';
import {COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS, ANIM} from '../../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapPickerModal from '../../components/MapPickerModal';

let DateTimePicker;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

const CATEGORIES = [
  { id: 1, iconName: 'book', name: 'Gia sư', hint: '150.000đ - 300.000đ/buổi', pricingType: 'hourly' },
  { id: 2, iconName: 'happy', name: 'Đón trẻ', hint: '80.000đ - 150.000đ/lần', pricingType: 'distance' },
  { id: 3, iconName: 'sparkles', name: 'Dọn dẹp', hint: '200.000đ - 400.000đ/ca', pricingType: 'hourly' },
  { id: 4, iconName: 'people', name: 'Trông trẻ', hint: '100.000đ - 200.000đ/buổi', pricingType: 'hourly' },
  { id: 5, iconName: 'bag', name: 'Mua sắm hộ', hint: '50.000đ - 100.000đ/lần', pricingType: 'fixed' },
  { id: 6, iconName: 'restaurant', name: 'Nấu ăn', hint: '100.000đ - 200.000đ/lần', pricingType: 'hourly' },
  { id: 7, iconName: 'hardware-chip', name: 'Hỗ trợ AI', hint: 'Thoả thuận', pricingType: 'fixed' },
  { id: 8, iconName: 'apps', name: 'Khác', hint: 'Thoả thuận', pricingType: 'fixed' },
];

export default function CreateTaskScreen() {
  const navigation = useNavigation();

  // QA-FIX-UI 3.2: fade-in animation khi mount (opacity 0→1)
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIM.timingNormal,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // === A1: Fetch categories từ DB thật khi mount ===
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getCategories();
        if (!cancelled && res.data?.length > 0) {
          setDbCategories(res.data);
          // Mặc định chọn category đầu tiên
          if (!selectedCat) setSelectedCat(res.data[0].id);
        }
      } catch (e) {
        console.warn('[A1] Failed to fetch categories:', e?.message || e);
        // Fallback: dùng local CATEGORIES nếu API lỗi
        if (!selectedCat) setSelectedCat(1);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const insets = useSafeAreaInsets();
  const [selectedCat, setSelectedCat] = useState(null); // DB ID thật, fetch từ API
  const [dbCategories, setDbCategories] = useState([]); // danh sách từ DB
  const [estimatedHours, setEstimatedHours] = useState('2'); // input số giờ cho hourly
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

  const [titleFocused, setTitleFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);
  const [locationFocused, setLocationFocused] = useState(false);
  const [priceFocused, setPriceFocused] = useState(false);

  const [enableGeofence, setEnableGeofence] = useState(false);

  // QA-FIX-UI 3.3: errors state cho inline validation theo field
  // (thay Alert chung — user biết chính xác field nào đang sai)
  const [errors, setErrors] = useState({});
  const clearError = (field) => setErrors(prev => prev[field] ? { ...prev, [field]: undefined } : prev);
  const [geofenceRadius, setGeofenceRadius] = useState('500');

  // Map picker state — lưu toạ độ đã chọn trên bản đồ
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [pickedCoords, setPickedCoords] = useState(null); // { latitude, longitude, address }

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

  // Tìm category info: ưu tiên DB (name + pricingType), fallback local CATEGORIES
  // Gán tường minh từng field — KHÔNG dùng spread vì
  // dbCat dùng snake_case (pricing_type), localCat dùng camelCase (pricingType)
  // → spread ...localCat sẽ ghi đè pricingType đúng từ DB bằng giá trị hard-code.
  const dbCat = dbCategories.find(c => c.id === selectedCat);
  const localCat = CATEGORIES.find(c => c.id === selectedCat);
  const cat = {
    id: selectedCat,
    name: dbCat?.name ?? localCat?.name,
    hint: localCat?.hint,
    pricingType: dbCat?.pricing_type ?? localCat?.pricingType ?? 'fixed',
  };
  const catDisplayName = dbCat ? dbCat.name : (localCat?.name || '');

  // === A1: Gợi ý giá tự động ===
  const [priceSuggestion, setPriceSuggestion] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const priceDebounceRef = useRef(null);
  const abortRef = useRef(null);

  const fetchPriceSuggestion = useCallback(async (categoryId) => {
    if (!categoryId) return;
    setPriceLoading(true);
    try {
      if (abortRef.current) { try { abortRef.current.abort(); } catch(e) {} }
      const controller = new AbortController();
      abortRef.current = controller;

      const payload = { category_id: categoryId };
      if (pickedCoords) {
        payload.latitude = pickedCoords.latitude;
        payload.longitude = pickedCoords.longitude;
        // Cho distance: dùng fallback HCM center làm reference
        payload.reference_latitude = 10.7626;
        payload.reference_longitude = 106.6602;
      }
      if (cat?.pricingType === 'hourly') {
        const hours = parseFloat(estimatedHours);
        if (hours > 0) payload.estimated_duration_hours = hours;
      }

      const res = await getPriceSuggestion(payload);
      setPriceSuggestion(res.data);
    } catch (e) {
      if (e.name !== 'AbortError' && e.name !== 'CanceledError') {
        console.warn('[A1] Price suggestion error:', e?.message || e);
        setPriceSuggestion(null);
      }
    } finally {
      setPriceLoading(false);
    }
  }, [pickedCoords, cat?.pricingType, estimatedHours]);

  useEffect(() => {
    if (!selectedCat) { setPriceSuggestion(null); return; }
    if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current);
    priceDebounceRef.current = setTimeout(() => {
      fetchPriceSuggestion(selectedCat);
    }, 400);
    return () => { if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current); };
  }, [selectedCat, pickedCoords, fetchPriceSuggestion, estimatedHours]);

  const applySuggestedPrice = () => {
    if (priceSuggestion?.suggested_price) {
      setPrice(String(priceSuggestion.suggested_price));
      clearError('price');
    }
  };

  const priceHintContent = (() => {
    if (priceSuggestion) {
      const { suggested_price, price_range, pricing_type, reason, message } = priceSuggestion;
      if (message) return message;
      if (reason) return reason;
      if (suggested_price != null) {
        let txt = `Gợi ý: ${suggested_price.toLocaleString('vi-VN')}đ`;
        if (pricing_type === 'distance' && priceSuggestion.breakdown?.distance_km) {
          txt += ` (${priceSuggestion.breakdown.distance_km}km)`;
        } else if (pricing_type === 'hourly' && priceSuggestion.breakdown?.estimated_hours) {
          txt += ` (${priceSuggestion.breakdown.estimated_hours}h)`;
        }
        return txt;
      }
      if (price_range) return `Khoảng: ${price_range.min.toLocaleString('vi-VN')}đ - ${price_range.max.toLocaleString('vi-VN')}đ`;
    }
    return cat?.hint || '';
  })();

  const handleSubmit = async () => {
    // QA-FIX-UI 3.3: validate theo field, set errors state để hiển thị inline
    const newErrors = {};
    if (!title?.trim()) newErrors.title = 'Vui lòng nhập tiêu đề nhiệm vụ';
    if (!description?.trim()) newErrors.description = 'Vui lòng mô tả nhiệm vụ';
    if (!location?.trim()) newErrors.location = 'Vui lòng nhập địa điểm';
    if (!date?.trim()) newErrors.date = 'Vui lòng chọn ngày';
    if (!time?.trim()) newErrors.time = 'Vui lòng chọn giờ';
    if (!price?.trim()) newErrors.price = 'Vui lòng nhập mức thù lao';

    // Validate format nếu field đã có giá trị
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const timeRegex = /^\d{2}:\d{2}$/;
    if (date && !dateRegex.test(date)) newErrors.date = 'Ngày phải có định dạng YYYY-MM-DD';
    if (time && !timeRegex.test(time)) newErrors.time = 'Giờ phải có định dạng HH:MM';

    setErrors(newErrors);

    // Nếu có lỗi → scroll lên đầu form + Alert ngắn gọn (giữ Alert chỉ cho
    // tóm tắt, không thay thế cho inline message)
    if (Object.keys(newErrors).length > 0) {
      const firstErrorField = Object.keys(newErrors)[0];
      Alert.alert(
        'Cần kiểm tra lại thông tin',
        `Vui lòng sửa ${Object.keys(newErrors).length} trường đang lỗi (xem thông báo dưới mỗi ô nhập).`
      );
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
              'Bạn chưa chọn vị trí trên bản đồ và chưa cấp quyền vị trí. Hãy bấm "Bản đồ" để chọn, hoặc cấp quyền vị trí để dùng vị trí hiện tại.',
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

      const res = await createTask(taskData);
      const newTaskId = res.data?.id;
      if (newTaskId) {
        Alert.alert('Thành công!', 'Đã đăng việc lên cộng đồng.', [
          { text: 'Xem gợi ý phù hợp', onPress: () => navigation.replace('SmartMatches', { taskId: newTaskId, taskTitle: taskData.title }) },
          { text: 'Quay lại', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Thành công!', 'Đã đăng việc lên cộng đồng.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (error) {
      const data = error.response?.data;
      const msg = typeof data === 'object' ? JSON.stringify(data) : 'Đăng việc thất bại.';
      Alert.alert('Lỗi', msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { opacity: fadeAnim }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />

      {/* Top App Bar — trắng, back + title + spacer */}
      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.appBarBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
         accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Tạo yêu cầu mới</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Progress Stepper — cosmetic, 3 bước */}
        <View style={styles.stepperRow}>
          <View style={[styles.stepCircle, styles.stepCircleActive]}>
            <Text style={styles.stepTextActive}>1</Text>
          </View>
          <View style={styles.stepLine} />
          <View style={styles.stepCircle}>
            <Text style={styles.stepText}>2</Text>
          </View>
          <View style={styles.stepLine} />
          <View style={styles.stepCircle}>
            <Text style={styles.stepText}>3</Text>
          </View>
        </View>

        {/* Section: Loại dịch vụ — chips pill style */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Loại dịch vụ</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => {
              // Ưu tiên tên từ DB khi đã fetch, fallback local name
              const dbMatch = dbCategories.find(db => db.id === c.id);
              const displayName = dbMatch ? dbMatch.name : c.name;
              return (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, selectedCat === c.id && styles.chipActive]}
                onPress={() => setSelectedCat(c.id)}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={c.iconName}
                  size={16}
                  color={selectedCat === c.id ? '#ffffff' : COLORS.onSurface}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.chipText, selectedCat === c.id && styles.chipTextActive]}>
                  {displayName}
                </Text>
              </TouchableOpacity>
              );
            })}
          </View>

          {/* Gợi ý giá (A1 — động) */}
          <View style={styles.priceHintBox}>
            {priceLoading ? (
              <ActivityIndicator size='small' color={COLORS.primary} />
            ) : (
              <Ionicons name="bulb-outline" size={14} color={COLORS.primary} />
            )}
            <Text style={styles.priceHintText} numberOfLines={2}>
              {catDisplayName ? `Gợi ý cho ${catDisplayName}: ` : ''}{priceHintContent}
            </Text>
            {priceSuggestion?.suggested_price != null && !priceLoading && (
              <TouchableOpacity onPress={applySuggestedPrice} style={styles.applyPriceBtn} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Text style={styles.applyPriceBtnText}>Dùng giá gợi ý</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Section: Thông tin chi tiết */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Thông tin chi tiết</Text>

          {/* Title */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Tiêu đề công việc *</Text>
            <View style={[styles.inputWrapper, titleFocused && styles.inputWrapperFocused, errors.title && styles.inputWrapperError]}>
              <TextInput
                style={styles.input}
                placeholder="VD: Gia sư Toán lớp 5 mỗi tối 7h"
                placeholderTextColor={COLORS.outline}
                value={title}
                onChangeText={(v) => { setTitle(v); clearError('title'); }}
                onFocus={() => setTitleFocused(true)}
                onBlur={() => setTitleFocused(false)}
              />
            </View>
            {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
          </View>

          {/* Description */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Mô tả chi tiết *</Text>
            <View style={[styles.inputWrapper, styles.textareaWrapper, descFocused && styles.inputWrapperFocused, errors.description && styles.inputWrapperError]}>
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="Mô tả nhu cầu, yêu cầu cụ thể, thời lượng..."
                placeholderTextColor={COLORS.outline}
                value={description}
                onChangeText={(v) => { setDescription(v); clearError('description'); }}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                onFocus={() => setDescFocused(true)}
                onBlur={() => setDescFocused(false)}
              />
            </View>
            {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
          </View>

          {/* Location */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Địa điểm *</Text>
            <View style={[styles.inputWrapper, locationFocused && styles.inputWrapperFocused, errors.location && styles.inputWrapperError]}>
              <Ionicons
                name="location-outline"
                size={18}
                color={locationFocused ? COLORS.primary : COLORS.outlineVariant}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="VD: 123 Lê Lợi, Q1, TP.HCM"
                placeholderTextColor={COLORS.outline}
                value={location}
                onChangeText={(v) => { setLocation(v); clearError('location'); }}
                onFocus={() => setLocationFocused(true)}
                onBlur={() => setLocationFocused(false)}
              />
              <TouchableOpacity
                style={styles.mapPickerBtn}
                onPress={() => setShowMapPicker(true)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Chọn vị trí trên bản đồ"
              >
                <Ionicons name="map-outline" size={16} color={COLORS.primary} />
                <Text style={styles.mapPickerBtnText}>Bản đồ</Text>
              </TouchableOpacity>
            </View>
            {errors.location && <Text style={styles.errorText}>{errors.location}</Text>}
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

          {/* Date & Time — 2 columns */}
          <View style={styles.twoColRow}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Ngày</Text>
              <TouchableOpacity
                style={[styles.inputWrapper, errors.date && styles.inputWrapperError]}
                onPress={() => { clearError('date'); handleOpenDatePicker(); }}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={18} color={COLORS.primary} style={styles.inputIcon} />
                <Text style={[styles.inputText, !date && styles.inputPlaceholder]}>
                  {date || 'Chọn ngày'}
                </Text>
              </TouchableOpacity>
              {errors.date && <Text style={styles.errorText}>{errors.date}</Text>}
            </View>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Giờ</Text>
              <TouchableOpacity
                style={[styles.inputWrapper, errors.time && styles.inputWrapperError]}
                onPress={() => { clearError('time'); handleOpenTimePicker(); }}
                activeOpacity={0.7}
              >
                <Ionicons name="time-outline" size={18} color={COLORS.primary} style={styles.inputIcon} />
                <Text style={[styles.inputText, !time && styles.inputPlaceholder]}>
                  {time || 'Chọn giờ'}
                </Text>
              </TouchableOpacity>
              {errors.time && <Text style={styles.errorText}>{errors.time}</Text>}
            </View>
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

          {/* Price */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Giá thỏa thuận (VNĐ)</Text>
            <View style={[styles.inputWrapper, priceFocused && styles.inputWrapperFocused, errors.price && styles.inputWrapperError]}>
              <TextInput
                style={[styles.input, { fontWeight: '700', color: COLORS.primary }]}
                placeholder="0"
                placeholderTextColor={COLORS.outline}
                value={price}
                onChangeText={(v) => { setPrice(v); clearError('price'); }}
                keyboardType="numeric"
                onFocus={() => setPriceFocused(true)}
                onBlur={() => setPriceFocused(false)}
              />
              <Text style={styles.currencyUnit}>VNĐ</Text>
            </View>
            {errors.price && <Text style={styles.errorText}>{errors.price}</Text>}
          </View>

          {/* Số giờ dự kiến — chỉ hiện khi category loại hourly */}
          {cat?.pricingType === 'hourly' && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Số giờ dự kiến</Text>
              <View style={[styles.inputWrapper, styles.durationInputWrapper]}>
                <TextInput
                  style={[styles.input, { fontWeight: '700', color: COLORS.primary }]}
                  placeholder="2"
                  placeholderTextColor={COLORS.outline}
                  value={estimatedHours}
                  onChangeText={setEstimatedHours}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.currencyUnit}>giờ</Text>
              </View>
            </View>
          )}
        </View>

        {/* Section: Vùng an toàn (Geofence) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vùng an toàn (tuỳ chọn)</Text>
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
                Yêu cầu theo dõi vị trí Carepartner
              </Text>
              <Text style={styles.geofenceToggleDesc}>
                Carepartner phải đồng ý chia sẻ vị trí mới được nhận việc. Bạn sẽ nhận chuông cảnh báo khi họ rời vùng an toàn.
              </Text>
            </View>
          </TouchableOpacity>

          {enableGeofence && (
            <View style={styles.geofenceSettings}>
              <Text style={styles.fieldLabel}>Bán kính vùng an toàn (mét)</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="map-outline" size={18} color={COLORS.primary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { fontWeight: '700', color: COLORS.primary }]}
                  placeholder="500"
                  placeholderTextColor={COLORS.outline}
                  value={geofenceRadius}
                  onChangeText={setGeofenceRadius}
                  keyboardType="numeric"
                />
                <Text style={styles.currencyUnit}>mét</Text>
              </View>
              <Text style={styles.geofenceHint}>Khuyến nghị: 300-1000m. Tâm vùng sẽ dùng toạ độ từ bản đồ nếu đã chọn, nếu không sẽ dùng vị trí hiện tại của bạn.</Text>
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky footer — submit button */}
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

      {/* Map Picker Modal — chọn toạ độ từ bản đồ */}
      <MapPickerModal
        visible={showMapPicker}
        onPick={(coords) => {
          setPickedCoords(coords);
          // Auto-fill location text if address available from reverse geocoding
          if (coords.address) {
            setLocation(coords.address);
            clearError('location');
          }
        }}
        onClose={() => setShowMapPicker(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  // === APP BAR ===
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  appBarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appBarTitle: {
    ...TYPO.h3,
    color: COLORS.onSurface,
  },
  // === SCROLL ===
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  // === STEPPER ===
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    paddingHorizontal: 40,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceContainer, // surface-variant
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: COLORS.primary, // primary-container
    borderWidth: 0,
    ...SHADOWS.medium,
  },
  stepText: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
  },
  stepTextActive: {
    ...TYPO.caption,
    color: COLORS.textOnPrimary,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.outlineVariant,
    marginHorizontal: -4,
    zIndex: -1,
  },
  // === SECTIONS ===
  section: {
    marginBottom: 24,
    gap: 12,
  },
  sectionTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
  },
  // === CHIPS ===
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999, // rounded-full
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    ...SHADOWS.small,
  },
  chipText: {
    ...TYPO.body,
    fontSize: 14,
    color: COLORS.onSurface,
  },
  chipTextActive: {
    color: COLORS.textOnPrimary,
  },
  priceHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },
  priceHintText: {
    flex: 1,
    ...TYPO.bodySmall,
    color: COLORS.primaryDark,
    fontWeight: '500',
  },
  // === FIELD GROUP ===
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
  },
  // === INPUT WRAPPER ===
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant, // outline-variant
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
  },
  inputWrapperFocused: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    paddingHorizontal: 13, // adjust for thicker border
    ...SHADOWS.inputFocus,
  },
  // QA-FIX-UI 3.3: error state cho input wrapper
  inputWrapperError: {
    borderColor: COLORS.error,
    borderWidth: 2,
    paddingHorizontal: 13,
  },
  errorText: {
    ...TYPO.caption,
    color: COLORS.error,
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '600',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    ...TYPO.body,
    color: COLORS.onSurface,
    paddingVertical: 0,
  },
  inputText: {
    ...TYPO.body,
    color: COLORS.onSurface,
  },
  inputPlaceholder: {
    color: COLORS.outline,
  },
  durationInputWrapper: { width: 140 },
  currencyUnit: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    fontWeight: '700',
    marginLeft: 8,
  },
  textareaWrapper: {
    height: undefined,
    minHeight: 110,
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  textarea: {
    minHeight: 86,
    lineHeight: 22,
  },
  // === TWO COLUMN ===
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
  },
  // === GEOFENCE ===
  geofenceToggle: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    padding: 14,
  },
  geofenceToggleActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  geofenceCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.outline,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  geofenceCheckboxActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  geofenceToggleTitle: {
    ...TYPO.body,
    fontSize: 14,
    color: COLORS.onSurface,
    fontWeight: '700',
    marginBottom: 4,
  },
  geofenceToggleDesc: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    lineHeight: 18,
  },
  geofenceSettings: {
    gap: 8,
  },
  geofenceHint: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    fontStyle: 'italic',
  },
  // === MAP PICKER ===
  mapPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.primaryLight,
    marginLeft: 8,
  },
  mapPickerBtnText: {
    ...TYPO.caption,
    color: COLORS.primary,
    fontWeight: '600',
  },
  pickedCoordsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.primaryLight,
  },
  pickedCoordsText: {
    flex: 1,
    ...TYPO.caption,
    color: COLORS.primaryDark || COLORS.primary,
    lineHeight: 18,
  },
  // === FOOTER ===
  footer: {
    padding: 20,
    paddingBottom: 36,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.large,
  },
  applyPriceBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  applyPriceBtnText: {
    ...TYPO.caption,
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },
  submitText: {
    ...TYPO.h4,
    color: COLORS.textOnPrimary,
  },
});
