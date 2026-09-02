// ============================================================
// WorkerAvailabilityScreen — Feature A2: Smart Job Matching
// Quản lý khung giờ rảnh của CarePartner (CRUD)
// Pattern: WorkerProfileScreen + CandidatesScreen styling
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  Alert, Platform, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getWorkerAvailability, createWorkerAvailability,
  updateWorkerAvailability, deleteWorkerAvailability,
} from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

// DateTimePicker chỉ import trên native (cùng pattern CreateTaskScreen)
let DateTimePicker;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

// Danh sách ngày trong tuần (việt nam)
const WEEKDAYS = [
  { value: 0, label: 'Thứ 2', shortLabel: 'T2' },
  { value: 1, label: 'Thứ 3', shortLabel: 'T3' },
  { value: 2, label: 'Thứ 4', shortLabel: 'T4' },
  { value: 3, label: 'Thứ 5', shortLabel: 'T5' },
  { value: 4, label: 'Thứ 6', shortLabel: 'T6' },
  { value: 5, label: 'Thứ 7', shortLabel: 'T7' },
  { value: 6, label: 'Chủ nhật', shortLabel: 'CN' },
];

export default function WorkerAvailabilityScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  // === State ===
  const [windows, setWindows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedWeekday, setSelectedWeekday] = useState(0);
  const [startTime, setStartTime] = useState(new Date(2026, 0, 1, 8, 0, 0));
  const [endTime, setEndTime] = useState(new Date(2026, 0, 1, 12, 0, 0));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // === Fetch ===
  const fetchWindows = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getWorkerAvailability();
      setWindows(res.data || []);
    } catch (e) {
      const msg = e.response?.data?.error || e.response?.data?.detail || 'Không thể tải khung giờ.';
      Alert.alert('Lỗi', typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWindows();
  }, [fetchWindows]);

  // === Helpers ===
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    // timeStr could be "HH:MM:SS" or a Date
    if (typeof timeStr === 'string') {
      const parts = timeStr.split(':');
      return `${parts[0]}:${parts[1]}`;
    }
    return timeStr;
  };

  const getWeekdayLabel = (weekdayNum) => {
    const found = WEEKDAYS.find(w => w.value === weekdayNum);
    return found ? found.label : `Ngày ${weekdayNum}`;
  };

  // Group windows by weekday
  const grouped = WEEKDAYS.map((wd) => {
    const items = windows
      .filter(w => w.weekday === wd.value)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    return { ...wd, items };
  }).filter(g => g.items.length > 0);

  // === Actions ===
  const openAddModal = () => {
    setEditingId(null);
    setSelectedWeekday(0);
    setStartTime(new Date(2026, 0, 1, 8, 0, 0));
    setEndTime(new Date(2026, 0, 1, 12, 0, 0));
    setShowStartPicker(false);
    setShowEndPicker(false);
    setModalVisible(true);
  };

  const openEditModal = (item) => {
    setEditingId(item.id);
    setSelectedWeekday(item.weekday);
    // Parse time strings to Date objects for pickers
    const sp = (item.start_time || '08:00').split(':');
    const ep = (item.end_time || '12:00').split(':');
    setStartTime(new Date(2026, 0, 1, parseInt(sp[0], 10) || 8, parseInt(sp[1], 10) || 0, 0));
    setEndTime(new Date(2026, 0, 1, parseInt(ep[0], 10) || 12, parseInt(ep[1], 10) || 0, 0));
    setShowStartPicker(false);
    setShowEndPicker(false);
    setModalVisible(true);
  };

  const handleDelete = (item) => {
    const timeText = `${getWeekdayLabel(item.weekday)}, ${formatTime(item.start_time)} - ${formatTime(item.end_time)}`;
    Alert.alert(
      'Xoá khung giờ',
      `Bạn có chắc muốn xoá: ${timeText}?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá', style: 'destructive',
          onPress: async () => {
            try {
              await deleteWorkerAvailability(item.id);
              Alert.alert('Thành công', 'Đã xoá khung giờ.');
              fetchWindows();
            } catch (e) {
              const msg = e.response?.data?.error || e.response?.data?.detail || 'Xoá thất bại.';
              Alert.alert('Lỗi', typeof msg === 'string' ? msg : JSON.stringify(msg));
            }
          },
        },
      ],
    );
  };

  const timeToHMS = (date) => {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}:00`;
  };

  const handleSubmit = async () => {
    // Validation
    if (startTime >= endTime) {
      Alert.alert('Lỗi', 'Giờ bắt đầu phải nhỏ hơn giờ kết thúc.');
      return;
    }

    const payload = {
      weekday: selectedWeekday,
      start_time: timeToHMS(startTime),
      end_time: timeToHMS(endTime),
    };

    setIsSubmitting(true);
    try {
      if (editingId) {
        await updateWorkerAvailability(editingId, payload);
        Alert.alert('Thành công', 'Đã cập nhật khung giờ.');
      } else {
        await createWorkerAvailability(payload);
        Alert.alert('Thành công', 'Đã thêm khung giờ mới.');
      }
      setModalVisible(false);
      fetchWindows();
    } catch (e) {
      const detail = e.response?.data;
      let msg = 'Thao tác thất bại.';
      if (detail) {
        // Could be { error: "..." } or { non_field_errors: [...] } or { field: [...] }
        if (typeof detail === 'string') msg = detail;
        else if (detail.error) msg = detail.error;
        else if (detail.detail) msg = detail.detail;
        else if (detail.non_field_errors) msg = detail.non_field_errors.join(', ');
        else {
          const firstKey = Object.keys(detail)[0];
          if (firstKey && Array.isArray(detail[firstKey])) msg = detail[firstKey].join(', ');
        }
      }
      Alert.alert('Lỗi', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // === Time picker handlers ===
  const onStartTimeChange = (event, date) => {
    setShowStartPicker(Platform.OS === 'ios');
    if (date) setStartTime(date);
  };

  const onEndTimeChange = (event, date) => {
    setShowEndPicker(Platform.OS === 'ios');
    if (date) setEndTime(date);
  };

  const timeDisplay = (date) => {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  // === Render ===
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* App Bar */}
      <View style={[styles.appBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.appBarBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Khung giờ rảnh</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Info banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
        <Text style={styles.infoBannerText}>
          Thêm khung giờ rảnh để EduCareLink đề xuất việc phù hợp cho bạn.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Đang tải khung giờ...</Text>
        </View>
      ) : windows.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="calendar-outline" size={40} color={COLORS.primary} />
          </View>
          <Text style={styles.emptyTitle}>Chưa có khung giờ</Text>
          <Text style={styles.emptyText}>
            Thêm khung giờ rảnh để nhận gợi ý việc làm phù hợp hơn.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {grouped.map((group) => (
            <View key={group.value} style={styles.daySection}>
              <Text style={styles.dayLabel}>{group.label}</Text>
              <View style={styles.dayCard}>
                {group.items.map((item) => (
                  <View key={item.id} style={styles.windowRow}>
                    <View style={styles.windowTimeBox}>
                      <Ionicons name="time-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.windowTime}>
                        {formatTime(item.start_time)} – {formatTime(item.end_time)}
                      </Text>
                    </View>
                    <View style={styles.windowActions}>
                      <TouchableOpacity
                        onPress={() => openEditModal(item)}
                        style={styles.iconBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Sửa khung giờ"
                      >
                        <Ionicons name="pencil" size={18} color={COLORS.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDelete(item)}
                        style={styles.iconBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Xoá khung giờ"
                      >
                        <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* FAB — Thêm khung giờ */}
      {!isLoading && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 24 }]}
          onPress={openAddModal}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Thêm khung giờ mới"
        >
          <Ionicons name="add" size={28} color={COLORS.textOnPrimary} />
          <Text style={styles.fabText}>Thêm khung giờ</Text>
        </TouchableOpacity>
      )}

      {/* === Modal: Thêm / Sửa khung giờ === */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Sửa khung giờ' : 'Thêm khung giờ'}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Weekday picker (segmented control) */}
            <Text style={styles.modalLabel}>Ngày trong tuần *</Text>
            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((wd) => (
                <Pressable
                  key={wd.value}
                  style={[
                    styles.weekdayChip,
                    selectedWeekday === wd.value && styles.weekdayChipActive,
                  ]}
                  onPress={() => setSelectedWeekday(wd.value)}
                >
                  <Text
                    style={[
                      styles.weekdayChipText,
                      selectedWeekday === wd.value && styles.weekdayChipTextActive,
                    ]}
                  >
                    {wd.shortLabel}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Start time picker */}
            <Text style={styles.modalLabel}>Giờ bắt đầu *</Text>
            <TouchableOpacity
              style={styles.timePickerBtn}
              onPress={() => {
                if (Platform.OS === 'web') {
                  // Web: use prompt-like workaround (simple)
                  const val = prompt('Nhập giờ bắt đầu (HH:MM):', timeDisplay(startTime));
                  if (val) {
                    const parts = val.split(':');
                    const h = parseInt(parts[0], 10);
                    const m = parseInt(parts[1], 10);
                    if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                      setStartTime(new Date(2026, 0, 1, h, m, 0));
                    }
                  }
                } else {
                  setShowStartPicker(true);
                }
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={18} color={COLORS.primary} />
              <Text style={styles.timePickerText}>{timeDisplay(startTime)}</Text>
              <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>

            {/* End time picker */}
            <Text style={styles.modalLabel}>Giờ kết thúc *</Text>
            <TouchableOpacity
              style={styles.timePickerBtn}
              onPress={() => {
                if (Platform.OS === 'web') {
                  const val = prompt('Nhập giờ kết thúc (HH:MM):', timeDisplay(endTime));
                  if (val) {
                    const parts = val.split(':');
                    const h = parseInt(parts[0], 10);
                    const m = parseInt(parts[1], 10);
                    if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                      setEndTime(new Date(2026, 0, 1, h, m, 0));
                    }
                  }
                } else {
                  setShowEndPicker(true);
                }
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={18} color={COLORS.primary} />
              <Text style={styles.timePickerText}>{timeDisplay(endTime)}</Text>
              <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>

            {/* Validation hint */}
            {startTime >= endTime ? (
              <View style={styles.validationHint}>
                <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                <Text style={styles.validationHintText}>Giờ bắt đầu phải nhỏ hơn giờ kết thúc.</Text>
              </View>
            ) : null}

            {/* Submit button */}
            <TouchableOpacity
              style={[styles.submitBtn, isSubmitting && { opacity: 0.7 }, startTime >= endTime && { opacity: 0.4 }]}
              onPress={handleSubmit}
              disabled={isSubmitting || startTime >= endTime}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.submitBtnText}>
                    {editingId ? 'Cập nhật' : 'Thêm khung giờ'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Native DateTimePicker for start time */}
      {showStartPicker && DateTimePicker && (
        <DateTimePicker
          value={startTime}
          mode="time"
          display="default"
          onChange={onStartTimeChange}
        />
      )}

      {/* Native DateTimePicker for end time */}
      {showEndPicker && DateTimePicker && (
        <DateTimePicker
          value={endTime}
          mode="time"
          display="default"
          onChange={onEndTimeChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surfaceWarm,
  },
  // === APP BAR ===
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: COLORS.surface,
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
  // === INFO BANNER ===
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    backgroundColor: COLORS.primaryLight,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },
  infoBannerText: {
    flex: 1,
    ...TYPO.bodySmall,
    color: COLORS.primaryDark,
    lineHeight: 18,
  },
  // === CENTER CONTAINERS (loading / empty) ===
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    ...TYPO.bodySmall,
    color: COLORS.textMuted,
    marginTop: 12,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    ...SHADOWS.small,
  },
  emptyTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
    marginTop: 12,
  },
  emptyText: {
    ...TYPO.bodySmall,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 4,
  },
  // === SCROLL CONTENT ===
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 8,
  },
  // === DAY SECTION ===
  daySection: {
    marginTop: 8,
  },
  dayLabel: {
    ...TYPO.overline,
    color: COLORS.textMuted,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  dayCard: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    padding: 4,
    ...SHADOWS.small,
  },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  windowTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  windowTime: {
    ...TYPO.body,
    color: COLORS.onSurface,
  },
  windowActions: {
    flexDirection: 'row',
    gap: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // === FAB ===
  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radiusFull,
    paddingHorizontal: 24,
    paddingVertical: 14,
    ...SHADOWS.large,
  },
  fabText: {
    ...TYPO.buttonSmall,
    color: COLORS.textOnPrimary,
  },
  // === MODAL ===
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: SIZES.radiusXl,
    borderTopRightRadius: SIZES.radiusXl,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    ...TYPO.h4,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalLabel: {
    ...TYPO.overline,
    color: COLORS.textMuted,
    marginBottom: 6,
    marginTop: 12,
  },
  // === WEEKDAY CHIPS ===
  weekdayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  weekdayChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  weekdayChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  weekdayChipText: {
    ...TYPO.caption,
    color: COLORS.textMuted,
  },
  weekdayChipTextActive: {
    color: COLORS.textOnPrimary,
  },
  // === TIME PICKER BUTTON ===
  timePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.background,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  timePickerText: {
    flex: 1,
    ...TYPO.body,
    color: COLORS.textPrimary,
  },
  // === VALIDATION HINT ===
  validationHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    padding: 8,
    backgroundColor: COLORS.errorBg,
    borderRadius: SIZES.radiusSm,
  },
  validationHintText: {
    ...TYPO.caption,
    color: COLORS.error,
  },
  // === SUBMIT BUTTON ===
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radiusMd,
    height: 50,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    ...SHADOWS.large,
  },
  submitBtnText: {
    color: COLORS.textOnPrimary,
    ...TYPO.button,
    fontSize: 15,
  },
});
