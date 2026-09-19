// ============================================================
// BlackoutScreen.js — Khai Báo Lịch Bận & Nghỉ Đột Xuất CarePartner
// Thiết kế nâng cấp theo chuẩn Google Stitch UI (Warm Professionalism, Bento Grid, Zero Jargon)
// - Sticky Header: Nút quay lại, tiêu đề "Khai Báo Lịch Bận & Thi", nút mở Modal quy định
// - Hero Bento Shield: Bảo vệ điểm tín nhiệm ELO & hạn mức 30 ngày
// - Form Bento: 6 Reason Chips (Thi, Sức khỏe, Gia đình, Đi xa, Cá nhân, Khác),
//   Ghi chú chi tiết môn học, Switch bận cả ngày vs Khung giờ bận (+/- 30 phút),
//   Chọn ngày trực quan qua DateTimePicker, nút lưu to bản "Lưu Lịch Bận & Tạm Khóa Ghép Việc"
// - Bento List: Danh sách ngày bận đã khai (phân biệt màu đỏ cả ngày vs cam khung giờ, nút xóa thùng rác)
// - Rules Card: 3 quy tắc vàng bảo vệ hồ sơ đối tác
// - Giữ nguyên 100% Bottom Tab Bar của App (paddingBottom: 110)
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
  Switch,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
import { getBlackouts, addBlackout, deleteBlackout } from '../../api/matching';
import { formatDateToYMD } from '../../utils/date';

let DateTimePicker;
if (Platform.OS !== 'web') {
  try {
    DateTimePicker = require('@react-native-community/datetimepicker').default;
  } catch (_) {}
}

const REASONS = [
  { code: 'exam', label: 'Thi / Kiểm tra', emoji: '🎓', icon: 'school-outline' },
  { code: 'health', label: 'Sức khỏe / Ốm', emoji: '🩺', icon: 'medkit-outline' },
  { code: 'family', label: 'Việc gia đình', emoji: '🏡', icon: 'home-outline' },
  { code: 'travel', label: 'Đi xa / Về quê', emoji: '✈️', icon: 'airplane-outline' },
  { code: 'personal', label: 'Việc cá nhân', emoji: '👤', icon: 'person-outline' },
  { code: 'other', label: 'Lý do khác', emoji: '📌', icon: 'bookmark-outline' },
];

const TIME_PRESETS = [
  { label: 'Sáng (07:00 - 12:00)', from: '07:00', to: '12:00' },
  { label: 'Chiều (13:00 - 17:30)', from: '13:00', to: '17:30' },
  { label: 'Tối (18:00 - 22:00)', from: '18:00', to: '22:00' },
];

export default function BlackoutScreen() {
  const navigation = useNavigation();

  // Insets phòng thủ an toàn cho Jest tests không bọc SafeAreaProvider
  let insets = { top: 12, bottom: 24, left: 0, right: 0 };
  try {
    const safeInsets = useSafeAreaInsets();
    if (safeInsets) insets = safeInsets;
  } catch (_) {}

  // State
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [loadError, setLoadError] = useState('');

  // Form states
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1); // Mặc định ngày mai
    return d;
  });
  const [showPicker, setShowPicker] = useState(false);
  const [reason, setReason] = useState('exam');
  const [note, setNote] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [timeFrom, setTimeFrom] = useState('07:00');
  const [timeTo, setTimeTo] = useState('12:00');
  const [rulesModalVisible, setRulesModalVisible] = useState(false);

  // Tải danh sách ngày bận từ backend
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await getBlackouts();
      setItems(data ?? []);
    } catch (err) {
      setLoadError('Không tải được danh sách ngày bận. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Xử lý thay đổi DatePicker
  const onDateChange = (_event, date) => {
    setShowPicker(Platform.OS === 'ios');
    if (date) {
      setSelectedDate(date);
    }
  };

  // Điều chỉnh giờ bắt đầu / kết thúc theo bước nhảy 30 phút
  const adjustTime = (type, deltaMinutes) => {
    const parseMins = (str) => {
      const [h, m] = str.split(':').map(Number);
      return h * 60 + m;
    };
    const formatMins = (mins) => {
      const positiveMins = (mins + 24 * 60) % (24 * 60);
      const h = Math.floor(positiveMins / 60);
      const m = positiveMins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    if (type === 'from') {
      const newMins = parseMins(timeFrom) + deltaMinutes;
      setTimeFrom(formatMins(newMins));
    } else {
      const newMins = parseMins(timeTo) + deltaMinutes;
      setTimeTo(formatMins(newMins));
    }
  };

  // Định dạng ngày theo tiếng Việt hiển thị
  const formatDateVi = (dateObj) => {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    if (isNaN(d.getTime())) return String(dateObj);
    const weekdays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = weekdays[d.getDay()];
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dayName}, ${dd}/${mm}/${yyyy}`;
  };

  // Lưu ngày bận mới
  const handleSaveBlackout = async () => {
    const dateStr = formatDateToYMD(selectedDate);
    const payload = {
      date: dateStr,
      reason,
      note: note.trim() || undefined,
      time_from: allDay ? null : timeFrom,
      time_to: allDay ? null : timeTo,
    };

    setSubmitting(true);
    try {
      await addBlackout(payload);
      await load();
      Alert.alert('Thành công', `Đã ghi nhận ngày bận ${formatDateVi(selectedDate)}.`);
      setNote('');
    } catch (err) {
      const body = err?.response?.data;
      if (err?.response?.status === 409) {
        Alert.alert(
          'Trùng đơn đã xác nhận',
          'Ngày này bạn đang có đơn đã nhận việc. Hãy vào Việc của tôi để xin hoán đổi ca trước khi khai bận.'
        );
      } else if (body?.code === 'too_many_blackouts') {
        Alert.alert('Giới hạn', body.detail ?? 'Tối đa 30 ngày bận trong tương lai.');
      } else {
        const errorMsg =
          typeof body?.detail === 'string'
            ? body.detail
            : typeof body?.error === 'string'
            ? body.error
            : 'Không thể lưu ngày bận. Vui lòng thử lại.';
        Alert.alert('Không thể lưu', errorMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Xóa ngày bận
  const handleDeleteBlackout = (item) => {
    const reasonInfo = REASONS.find((r) => r.code === item.reason);
    Alert.alert(
      'Hủy lịch bận này?',
      `Bạn có chắc chắn muốn mở lại lịch nhận việc cho ngày ${formatDateVi(item.date)} (${
        item.time_from ? `${item.time_from.slice(0, 5)} - ${item.time_to.slice(0, 5)}` : 'Cả ngày'
      })?`,
      [
        { text: 'Đóng', style: 'cancel' },
        {
          text: 'Mở lại lịch nhận việc',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item.id);
            try {
              await deleteBlackout(item.id);
              await load();
            } catch {
              Alert.alert('Lỗi', 'Không thể xóa ngày bận. Vui lòng thử lại.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8FF" />

      {/* STICKY TOP APP BAR */}
      <View style={[styles.headerSection, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.canGoBack() && navigation.goBack()}
            accessibilityLabel="Quay lại"
          >
            <Ionicons name="arrow-back" size={20} color="#131B2E" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Khai Báo Lịch Bận & Thi
            </Text>
            <View style={styles.headerSubtitleRow}>
              <View style={styles.activeDot} />
              <Text style={styles.headerSubtitle}>AI tạm dừng ghép việc các ngày này</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setRulesModalVisible(true)}
            accessibilityLabel="Quy định báo bận"
          >
            <Ionicons name="shield-checkmark" size={20} color="#F26522" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[COLORS.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. HERO BENTO WARNING & SHIELD CARD */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.shieldIconWrap}>
              <Ionicons name="shield" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle}>Bảo Vệ Điểm Tín Nhiệm & ELO Đối Tác</Text>
              <Text style={styles.heroDesc}>
                Báo bận trước ít nhất 24 giờ giúp bạn duy trì chỉ số uy tín 100% và không bị trừ điểm tín nhiệm khi
                bước vào mùa thi học kỳ hoặc có việc gia đình đột xuất.
              </Text>
            </View>
          </View>

          {/* Badges row */}
          <View style={styles.heroBadgesRow}>
            <View style={styles.trustScorePill}>
              <Ionicons name="checkmark-circle" size={15} color="#00714C" />
              <Text style={styles.trustScoreText}>
                Điểm tín nhiệm hiện tại: <Text style={styles.boldText}>100/100</Text>
              </Text>
            </View>
            <View style={styles.limitPill}>
              <Ionicons name="time-outline" size={15} color="#855300" />
              <Text style={styles.limitText}>Tối đa 30 ngày bận tương lai</Text>
            </View>
          </View>
        </View>

        {/* 2. FORM BENTO: THÊM NGÀY BẬN MỚI */}
        <View style={styles.formCard}>
          <View style={styles.formHeaderRow}>
            <View style={styles.formTitleWrap}>
              <View style={styles.addIconCircle}>
                <Ionicons name="add-circle" size={19} color="#F26522" />
              </View>
              <Text style={styles.formTitle}>Thêm Ngày Bận Mới</Text>
            </View>
            <View style={styles.versionBadge}>
              <Text style={styles.versionBadgeText}>MẪU V2.4</Text>
            </View>
          </View>

          {/* REASON GRID (6 options) */}
          <View style={styles.sectionBlock}>
            <Text style={styles.fieldLabel}>CHỌN LÝ DO BẬN / NGHỈ (AI GHI NHẬN HỒ SƠ)</Text>
            <View style={styles.reasonGrid}>
              {REASONS.map((r) => {
                const isSelected = reason === r.code;
                return (
                  <TouchableOpacity
                    key={r.code}
                    style={[styles.reasonPill, isSelected && styles.reasonPillActive]}
                    onPress={() => setReason(r.code)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.reasonEmoji}>{r.emoji}</Text>
                    <Text style={[styles.reasonText, isSelected && styles.reasonTextActive]} numberOfLines={1}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* NOTE / EXAM DETAIL INPUT */}
          <View style={styles.sectionBlock}>
            <Text style={styles.fieldLabel}>CHI TIẾT MÔN HỌC HOẶC GHI CHÚ BẬN</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                placeholder="Ví dụ: Thi cuối kỳ môn Giải Tích 2 (ĐH Khoa học Huế)..."
                placeholderTextColor="#94A3B8"
                value={note}
                onChangeText={setNote}
              />
              <Ionicons name="create-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
            </View>
          </View>

          {/* ALL-DAY TOGGLE & HOURLY STEPPERS */}
          <View style={styles.timeSectionBox}>
            <View style={styles.timeToggleRow}>
              <View style={styles.timeToggleLeft}>
                <View style={styles.timeIconWrap}>
                  <Ionicons name="calendar-outline" size={18} color="#F26522" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.timeToggleTitle}>Bận cả ngày (24 giờ)</Text>
                  <Text style={styles.timeToggleSub}>Khuyên dùng khi thi môn chính hoặc về quê</Text>
                </View>
              </View>
              <Switch
                value={allDay}
                onValueChange={setAllDay}
                trackColor={{ false: '#CBD5E1', true: '#F26522' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Collapsible Hourly Segment */}
            {!allDay && (
              <View style={styles.hourlyContainer}>
                {/* Presets */}
                <View style={styles.presetChipsRow}>
                  {TIME_PRESETS.map((p, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.presetChip}
                      onPress={() => {
                        setTimeFrom(p.from);
                        setTimeTo(p.to);
                      }}
                    >
                      <Text style={styles.presetChipText}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Steppers */}
                <View style={styles.stepperCard}>
                  <View>
                    <Text style={styles.stepperLabel}>KHUNG GIỜ BẬN</Text>
                    <Text style={styles.stepperTimeDisplay}>
                      {timeFrom} – {timeTo}
                    </Text>
                  </View>
                  <View style={styles.stepperActions}>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => adjustTime('from', -30)}
                      accessibilityLabel="Lùi 30 phút bắt đầu"
                    >
                      <Ionicons name="remove" size={16} color="#131B2E" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.stepperBtn, styles.stepperBtnPrimary]}
                      onPress={() => adjustTime('to', 30)}
                      accessibilityLabel="Tăng 30 phút kết thúc"
                    >
                      <Ionicons name="add" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* DATE SELECTION TRIGGER */}
          <View style={styles.sectionBlock}>
            <Text style={styles.fieldLabel}>NGÀY ÁP DỤNG</Text>
            <TouchableOpacity
              style={styles.dateSelectorBtn}
              onPress={() => setShowPicker(true)}
              activeOpacity={0.8}
            >
              <View style={styles.dateLeftRow}>
                <View style={styles.calendarIconCircle}>
                  <Ionicons name="calendar" size={20} color="#F26522" />
                </View>
                <View>
                  <Text style={styles.dateValueText}>{formatDateVi(selectedDate)}</Text>
                  <Text style={styles.dateHintText}>Chạm để đổi ngày bạn muốn khai bận</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>

            {showPicker && DateTimePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="default"
                onChange={onDateChange}
                minimumDate={new Date()}
              />
            )}
          </View>

          {/* MAIN SUBMIT BUTTON */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSaveBlackout}
            disabled={submitting}
            activeOpacity={0.88}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                <Text style={styles.submitBtnText}>Lưu Lịch Bận & Tạm Khóa Ghép Việc</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* 3. REGISTERED BLACKOUT DATES BENTO LIST */}
        <View style={styles.listSection}>
          <View style={styles.listHeaderRow}>
            <View style={styles.listHeaderLeft}>
              <Text style={styles.listTitle}>Lịch bận đã đăng ký</Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{items.length} ngày</Text>
              </View>
            </View>
          </View>

          {loadError ? (
            <View style={styles.errorBox}>
              <Ionicons name="cloud-offline-outline" size={32} color="#DC2626" />
              <Text style={styles.errorText}>{loadError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={load}>
                <Text style={styles.retryBtnText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="calendar-outline" size={36} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>Chưa khai ngày bận nào</Text>
              <Text style={styles.emptyDesc}>
                Bạn chưa đăng ký ngày bận nào. AI đang sẵn sàng ghép việc cho bạn 7 ngày trong tuần.
              </Text>
            </View>
          ) : (
            <View style={styles.itemsList}>
              {items.map((item) => {
                const isAllDay = !item.time_from;
                const reasonObj = REASONS.find((r) => r.code === item.reason) || {
                  label: item.reason,
                  emoji: '📌',
                };

                return (
                  <View key={item.id} style={styles.blackoutCard}>
                    {/* Dải màu đánh dấu trái */}
                    <View
                      style={[
                        styles.cardLeftStrip,
                        isAllDay ? styles.stripRed : styles.stripAmber,
                      ]}
                    />

                    <View style={styles.cardMain}>
                      <View style={styles.cardHeaderRow}>
                        <Text style={styles.cardDateText}>{formatDateVi(item.date)}</Text>
                        <View
                          style={[
                            styles.timeTypeBadge,
                            isAllDay ? styles.badgeAllDay : styles.badgeHourly,
                          ]}
                        >
                          <Text
                            style={[
                              styles.timeTypeBadgeText,
                              isAllDay ? styles.textAllDay : styles.textHourly,
                            ]}
                          >
                            {isAllDay ? 'Cả ngày' : `${item.time_from.slice(0, 5)} – ${item.time_to.slice(0, 5)}`}
                          </Text>
                        </View>
                      </View>

                      {/* Lý do & ghi chú */}
                      <View style={styles.reasonRow}>
                        <Text style={styles.reasonBadgeText}>
                          {reasonObj.emoji} {reasonObj.label}
                        </Text>
                        {item.note ? (
                          <Text style={styles.cardNoteText} numberOfLines={1}>
                            · {item.note}
                          </Text>
                        ) : null}
                      </View>

                      {/* Trạng thái khóa AI */}
                      <View style={styles.cardFootnote}>
                        <Ionicons
                          name={isAllDay ? 'lock-closed' : 'time'}
                          size={12}
                          color={isAllDay ? '#DC2626' : '#D97706'}
                        />
                        <Text
                          style={[
                            styles.cardFootnoteText,
                            { color: isAllDay ? '#DC2626' : '#D97706' },
                          ]}
                        >
                          {isAllDay
                            ? 'Đã khóa tự động nhận đơn cả ngày'
                            : `Chỉ khóa ca ${item.time_from.slice(0, 5)} – ${item.time_to.slice(0, 5)} (Giờ khác vẫn nhận đơn)`}
                        </Text>
                      </View>
                    </View>

                    {/* Nút xóa thùng rác */}
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteBlackout(item)}
                      disabled={deletingId === item.id}
                      accessibilityLabel="Xóa ngày bận"
                    >
                      {deletingId === item.id ? (
                        <ActivityIndicator size="small" color="#DC2626" />
                      ) : (
                        <Ionicons name="trash-outline" size={18} color="#94A3B8" />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* 4. RULES & TRUST CARD */}
        <View style={styles.rulesCard}>
          <View style={styles.rulesHeaderRow}>
            <Ionicons name="book-outline" size={18} color="#F26522" />
            <Text style={styles.rulesTitle}>Quy tắc báo bận chuẩn CarePartner</Text>
          </View>
          <View style={styles.rulesList}>
            <View style={styles.ruleItem}>
              <View style={styles.ruleNumberCircle}>
                <Text style={styles.ruleNumberText}>1</Text>
              </View>
              <Text style={styles.ruleItemText}>
                <Text style={styles.boldText}>Không báo bận đè lên ca đã chốt: </Text>
                Nếu đã có phụ huynh xác nhận đơn, bạn cần vào mục "Việc của tôi" xin hoán đổi ca trước 24 giờ.
              </Text>
            </View>

            <View style={styles.ruleItem}>
              <View style={styles.ruleNumberCircle}>
                <Text style={styles.ruleNumberText}>2</Text>
              </View>
              <Text style={styles.ruleItemText}>
                <Text style={styles.boldText}>Giữ vững điểm 100/100: </Text>
                Báo trước 24 giờ với các lý do học tập, thi cử được hệ thống tự động bảo lưu thứ hạng ưu tiên ELO.
              </Text>
            </View>

            <View style={styles.ruleItem}>
              <View style={styles.ruleNumberCircle}>
                <Text style={styles.ruleNumberText}>3</Text>
              </View>
              <Text style={styles.ruleItemText}>
                <Text style={styles.boldText}>Tự động kích hoạt lại: </Text>
                Ngay khi hết khung giờ hoặc ngày bận, AI tự động mở lại trạng thái nhận ca mà không cần thao tác thêm.
              </Text>
            </View>
          </View>
        </View>

        {/* 5. UNIVERSITY TRUST BADGE */}
        <View style={styles.univBadgeRow}>
          <Ionicons name="checkmark-circle" size={15} color="#00714C" />
          <Text style={styles.univBadgeText}>
            Được hỗ trợ đồng bộ với lịch học VNU, FTU, NEU, HUST, ĐHQG
          </Text>
        </View>
      </ScrollView>

      {/* RULES MODAL POPUP */}
      <Modal
        visible={rulesModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRulesModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Ionicons name="shield-checkmark" size={22} color="#F26522" />
                <Text style={styles.modalTitle}>Quy định báo bận CarePartner</Text>
              </View>
              <TouchableOpacity onPress={() => setRulesModalVisible(false)}>
                <Ionicons name="close" size={22} color="#131B2E" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalParagraph}>
                Nhằm bảo vệ quyền lợi học tập của sinh viên và đảm bảo độ tin cậy đối với phụ huynh, EduCareLink áp dụng
                cơ chế báo bận tự động:
              </Text>
              <Text style={styles.modalBullet}>
                • <Text style={styles.boldText}>Báo trước &gt; 24h:</Text> Hoàn toàn miễn phí, không ảnh hưởng thứ tự
                ưu tiên nhận việc (ELO 100%).
              </Text>
              <Text style={styles.modalBullet}>
                • <Text style={styles.boldText}>Trùng lịch đơn đã nhận:</Text> Bạn phải chủ động liên hệ Phụ huynh hoặc
                dùng nút Đổi lịch trong chi tiết đơn trước khi khai bận.
              </Text>
              <Text style={styles.modalBullet}>
                • <Text style={styles.boldText}>Hạn mức tối đa:</Text> Mỗi CarePartner được khai tối đa 30 ngày bận
                trong tương lai để đảm bảo tính sẵn sàng.
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setRulesModalVisible(false)}>
              <Text style={styles.modalCloseBtnText}>Đã hiểu quy định</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8FF',
  },
  headerSection: {
    backgroundColor: 'rgba(250, 248, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  headerTitleWrap: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#131B2E',
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00714C',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#594138',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 110, // Giữ khoảng an toàn không che khuất Bottom Tab Navigator
  },

  // 1. HERO SHIELD CARD
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FED7AA',
    ...SHADOWS.small,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  shieldIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  heroTextWrap: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#131B2E',
    marginBottom: 4,
  },
  heroDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#594138',
  },
  heroBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  trustScorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  trustScoreText: {
    fontSize: 11.5,
    color: '#00714C',
  },
  limitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  limitText: {
    fontSize: 11.5,
    color: '#855300',
    fontWeight: '600',
  },
  boldText: {
    fontWeight: '700',
  },

  // 2. FORM BENTO
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    ...SHADOWS.small,
  },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  formTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF4ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#131B2E',
  },
  versionBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  versionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },

  sectionBlock: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonPill: {
    width: '31%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reasonPillActive: {
    backgroundColor: '#FFF4ED',
    borderColor: '#F26522',
    borderWidth: 1.5,
    ...SHADOWS.small,
  },
  reasonEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 11,
    color: '#475569',
    textAlign: 'center',
  },
  reasonTextActive: {
    color: '#F26522',
    fontWeight: '700',
  },

  inputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingRight: 38,
    paddingVertical: 10,
    fontSize: 13,
    color: '#131B2E',
  },
  inputIcon: {
    position: 'absolute',
    right: 12,
  },

  // TIME SECTION
  timeSectionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  timeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  timeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFF4ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeToggleTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#131B2E',
  },
  timeToggleSub: {
    fontSize: 11,
    color: '#64748B',
  },
  hourlyContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  presetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  presetChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  presetChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  stepperCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepperLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  stepperTimeDisplay: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F26522',
    marginTop: 2,
  },
  stepperActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnPrimary: {
    backgroundColor: '#F26522',
  },

  // DATE SELECTOR
  dateSelectorBtn: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  calendarIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFF4ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateValueText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#131B2E',
  },
  dateHintText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },

  submitBtn: {
    backgroundColor: '#F26522',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...SHADOWS.small,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // 3. BLACKOUT LIST
  listSection: {
    marginBottom: 20,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  listHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#131B2E',
  },
  countPill: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991B1B',
  },
  itemsList: {
    gap: 10,
  },
  blackoutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOWS.small,
  },
  cardLeftStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  stripRed: {
    backgroundColor: '#E11D48',
  },
  stripAmber: {
    backgroundColor: '#F59E0B',
  },
  cardMain: {
    flex: 1,
    paddingLeft: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardDateText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#131B2E',
  },
  timeTypeBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeAllDay: {
    backgroundColor: '#FEE2E2',
  },
  badgeHourly: {
    backgroundColor: '#FEF3C7',
  },
  timeTypeBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  textAllDay: {
    color: '#991B1B',
  },
  textHourly: {
    color: '#92400E',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  reasonBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  cardNoteText: {
    fontSize: 11.5,
    color: '#64748B',
    marginLeft: 4,
    flex: 1,
  },
  cardFootnote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardFootnoteText: {
    fontSize: 10.5,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#131B2E',
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#F26522',
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },

  // 4. RULES CARD
  rulesCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rulesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  rulesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#131B2E',
  },
  rulesList: {
    gap: 10,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  ruleNumberCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF4ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  ruleNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F26522',
  },
  ruleItemText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
  },

  // 5. UNIV BADGE
  univBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  univBadgeText: {
    fontSize: 11,
    color: '#64748B',
  },

  // MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    ...SHADOWS.medium,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#131B2E',
  },
  modalParagraph: {
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
    marginBottom: 10,
  },
  modalBullet: {
    fontSize: 12.5,
    lineHeight: 19,
    color: '#334155',
    marginBottom: 8,
  },
  modalCloseBtn: {
    marginTop: 16,
    backgroundColor: '#F26522',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
