// ============================================================
// AvailabilityScreen.js — Đăng ký Lịch rảnh & Ghép việc AI của CarePartner
// Thiết kế nâng cấp theo chuẩn Google Stitch UI (Bento Grid, Warm Professionalism):
// - Header: "CAREPARTNER RADAR ACTIVE" + "Lịch Rảnh & Ghép Việc AI"
// - Hero Bento: Radar AI tìm việc (bán kính 10km), Thu nhập tuần ước tính, % Sẵn sàng, AI Tip
// - Horizontal Weekday Selector: 7 ngày T2 -> CN với số ca / trạng thái trống
// - 1-Tap Quick Presets: Giờ vàng (18-21h), Đón trẻ (14-17h30), Buổi sáng (8-11h30), Tối muộn (19h30-22h)
// - Registered Slots: Khung giờ đã mở (AI tìm phụ huynh, nút xóa) & Khung giờ đã ghép (khóa lịch bảo vệ ELO)
// - Custom Time Slot Stepper: Bộ tăng giảm giờ trực quan (+/- 30p), tự động tính thu nhập
// - Quick Actions: Nút "Báo bận / Thi" -> BlackoutScreen, Modal Quy tắc mở lịch
// - Giữ nguyên 100% Bottom Tab Navigator của App (không render thanh nav đáy trong screen)
// ============================================================

import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
  Dimensions,
  Modal,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import {
  getAvailability,
  addAvailability,
  deleteAvailability,
} from '../../api/matching';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const WEEKDAYS = [
  { value: 0, label: 'Thứ 2', short: 'T2' },
  { value: 1, label: 'Thứ 3', short: 'T3' },
  { value: 2, label: 'Thứ 4', short: 'T4' },
  { value: 3, label: 'Thứ 5', short: 'T5' },
  { value: 4, label: 'Thứ 6', short: 'T6' },
  { value: 5, label: 'Thứ 7', short: 'T7' },
  { value: 6, label: 'Chủ nhật', short: 'CN' },
];

const PRESETS = [
  {
    id: 'golden',
    name: 'Giờ vàng',
    badge: 'local_fire_department',
    duration: '3.0h',
    start: '18:00',
    end: '21:00',
    desc: '80% Phụ huynh đặt kèm học',
    isPeak: true,
  },
  {
    id: 'pickup',
    name: 'Đón trẻ',
    badge: null,
    duration: '3.5h',
    start: '14:00',
    end: '17:30',
    desc: 'Đón tan trường & vận động',
    isPeak: false,
  },
  {
    id: 'morning',
    name: 'Buổi sáng',
    badge: null,
    duration: '3.5h',
    start: '08:00',
    end: '11:30',
    desc: 'Ôn tập cuối tuần & đọc sách',
    isPeak: false,
  },
  {
    id: 'late',
    name: 'Tối muộn',
    badge: null,
    duration: '2.5h',
    start: '19:30',
    end: '22:00',
    desc: 'Kèm chuyên đề thi vào 10',
    isPeak: false,
  },
];

export default function AvailabilityScreen() {
  const navigation = useNavigation();
  let insets = { top: 12, bottom: 24, left: 0, right: 0 };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const safeInsets = useSafeAreaInsets();
    if (safeInsets) insets = safeInsets;
  } catch (_e) {
    // Fallback khi chạy test không bọc SafeAreaProvider
  }

  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [weekday, setWeekday] = useState(0); // 0 = T2
  const [loadError, setLoadError] = useState('');
  const [rulesModalVisible, setRulesModalVisible] = useState(false);

  // Stepper state: phút từ 0:00 (18:00 = 1080, 21:00 = 1260)
  const [startMinutes, setStartMinutes] = useState(18 * 60);
  const [endMinutes, setEndMinutes] = useState(21 * 60);

  // Tính ngày trong tuần hiện tại
  const weekDates = useMemo(() => {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = CN, 1 = T2
    const distanceToMonday = (currentDay + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday);

    return WEEKDAYS.map((wd, index) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + index);
      return {
        ...wd,
        dateNum: d.getDate(),
      };
    });
  }, []);

  // Format phút thành chuỗi "HH:mm"
  const minutesToStr = (m) => {
    const h = Math.floor(m / 60) % 24;
    const mins = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  // Tính tổng số giờ rảnh cả tuần
  const totalWeeklyHours = useMemo(() => {
    let totalMins = 0;
    windows.forEach((w) => {
      if (!w.time_from || !w.time_to) return;
      const [sh, sm] = w.time_from.slice(0, 5).split(':').map(Number);
      const [eh, em] = w.time_to.slice(0, 5).split(':').map(Number);
      let diff = eh * 60 + em - (sh * 60 + sm);
      if (diff <= 0) diff += 24 * 60;
      totalMins += diff;
    });
    return (totalMins / 60).toFixed(1);
  }, [windows]);

  // Ước tính thu nhập cả tuần (80k - 120k/h)
  const weeklyEarningsEstimate = useMemo(() => {
    const h = parseFloat(totalWeeklyHours);
    if (h <= 0) return '0đ';
    const minEarn = Math.round(h * 80 * 1000);
    const maxEarn = Math.round(h * 120 * 1000);
    return `${minEarn.toLocaleString('vi-VN')}đ ~ ${maxEarn.toLocaleString('vi-VN')}đ`;
  }, [totalWeeklyHours]);

  // Tính số ca cho từng ngày trong tuần
  const slotCountByWeekday = useMemo(() => {
    const map = {};
    WEEKDAYS.forEach((w) => {
      map[w.value] = 0;
    });
    windows.forEach((w) => {
      if (map[w.weekday] !== undefined) {
        map[w.weekday] += 1;
      }
    });
    return map;
  }, [windows]);

  // Các ca của ngày đang chọn
  const dayWindows = useMemo(() => {
    return windows.filter((w) => w.weekday === weekday);
  }, [windows, weekday]);

  // Tính tổng số giờ của ngày đang chọn
  const dayTotalHours = useMemo(() => {
    let totalMins = 0;
    dayWindows.forEach((w) => {
      if (!w.time_from || !w.time_to) return;
      const [sh, sm] = w.time_from.slice(0, 5).split(':').map(Number);
      const [eh, em] = w.time_to.slice(0, 5).split(':').map(Number);
      let diff = eh * 60 + em - (sh * 60 + sm);
      if (diff <= 0) diff += 24 * 60;
      totalMins += diff;
    });
    return (totalMins / 60).toFixed(1);
  }, [dayWindows]);

  // Tóm tắt thời lượng khung giờ đang chọn trong Stepper
  const stepperSummary = useMemo(() => {
    let diff = endMinutes - startMinutes;
    if (diff <= 0) diff += 24 * 60;
    const h = (diff / 60).toFixed(1);
    const minEarn = Math.round((diff / 60) * 80 * 1000);
    const maxEarn = Math.round((diff / 60) * 120 * 1000);
    return {
      hours: h,
      minEarn,
      maxEarn,
      payoutText: `~${minEarn.toLocaleString('vi-VN')}đ – ${maxEarn.toLocaleString('vi-VN')}đ`,
    };
  }, [startMinutes, endMinutes]);

  // Tải dữ liệu từ Backend
  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await getAvailability();
      setWindows(res.data?.windows ?? []);
    } catch (err) {
      setLoadError('Không tải được lịch rảnh từ hệ thống. Vui lòng thử lại.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // Điều chỉnh giờ stepper (+ / - delta phút)
  const adjustTime = (type, delta) => {
    if (type === 'start') {
      setStartMinutes((prev) => (prev + delta + 24 * 60) % (24 * 60));
    } else {
      setEndMinutes((prev) => (prev + delta + 24 * 60) % (24 * 60));
    }
  };

  // Chọn Preset
  const applyPreset = (startStr, endStr) => {
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    setStartMinutes(sh * 60 + sm);
    setEndMinutes(eh * 60 + em);
  };

  // Thêm khung giờ lên backend
  const addSlot = async () => {
    const tf = minutesToStr(startMinutes);
    const tt = minutesToStr(endMinutes);

    if (tf === tt) {
      return Alert.alert('Thời gian không hợp lệ', 'Giờ kết thúc phải khác giờ bắt đầu.');
    }

    setSaving(true);
    try {
      await addAvailability({ weekday, time_from: tf, time_to: tt });
      await load();
      Alert.alert('Thành công', `Đã mở khung giờ ${tf} – ${tt} cho ${WEEKDAYS[weekday].label}.`);
    } catch (err) {
      const body = err?.response?.data;
      if (body?.code === 'overlap_windows') {
        const m = body.merge_suggestion;
        Alert.alert(
          'Khung giờ chồng lấn',
          `Khung giờ này bị trùng với lịch bạn đã mở. Gợi ý gộp: ${m?.time_from?.slice(0, 5)} – ${m?.time_to?.slice(0, 5)}.`
        );
      } else {
        const msg =
          typeof body?.detail === 'string'
            ? body.detail
            : typeof body?.error === 'string'
            ? body.error
            : 'Không thể lưu khung giờ. Vui lòng thử lại.';
        Alert.alert('Không thể lưu', msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // Xóa khung giờ
  const removeSlot = (w) => {
    const dayLabel = WEEKDAYS.find((d) => d.value === w.weekday)?.label ?? '';
    const timeRange = `${w.time_from.slice(0, 5)} – ${w.time_to.slice(0, 5)}`;

    Alert.alert(
      'Xóa khung giờ rảnh?',
      `Bạn có chắc chắn muốn đóng khung giờ ${dayLabel} (${timeRange})?`,
      [
        { text: 'Đóng', style: 'cancel' },
        {
          text: 'Xóa khung giờ',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(w.id);
            try {
              await deleteAvailability(w.id);
              await load();
            } catch (err) {
              if (err?.response?.status === 409) {
                Alert.alert(
                  'Đang có đơn hoạt động',
                  'Khung giờ này đã được hệ thống ghép với Phụ huynh. Bạn không thể xóa để đảm bảo điểm tín nhiệm đối tác.'
                );
              } else {
                Alert.alert('Lỗi', 'Không xóa được khung giờ này. Vui lòng thử lại.');
              }
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const handleSupport = () => {
    Linking.openURL('tel:19006828').catch(() => {
      Alert.alert('Hỗ trợ 24/7', 'Tổng đài CarePartner EduCareLink: 1900 6828');
    });
  };

  const selectedDayInfo = WEEKDAYS[weekday] || WEEKDAYS[0];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8FF" />

      {/* TOP APP BAR */}
      <View style={[styles.appBar, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.appBarContent}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.canGoBack() && navigation.goBack()}
            accessibilityLabel="Quay lại"
          >
            <Ionicons name="arrow-back" size={22} color="#131B2E" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <View style={styles.radarBadge}>
              <View style={styles.pulseDot} />
              <Text style={styles.radarBadgeText}>CAREPARTNER RADAR ACTIVE</Text>
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Lịch Rảnh & Ghép Việc AI
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              Hệ thống AI tự động phân tích lịch và ghép việc cho bạn
            </Text>
          </View>

          <TouchableOpacity
            style={styles.supportBtn}
            onPress={handleSupport}
            accessibilityLabel="Tổng đài hỗ trợ"
          >
            <Ionicons name="headset-outline" size={22} color="#131B2E" />
            <View style={styles.supportStatusDot} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* INTERACTIVE STATE BAR & QUICK ACTIONS */}
        <View style={styles.statusBarRow}>
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Hồ sơ trực tuyến</Text>
          </View>

          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.iconCircleBtn}
              onPress={() => setRulesModalVisible(true)}
              accessibilityLabel="Quy tắc mở lịch"
            >
              <Ionicons name="help-circle-outline" size={20} color="#594138" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.blackoutBtn}
              onPress={() => navigation.navigate('Blackout')}
            >
              <Ionicons name="calendar-outline" size={14} color="#855300" />
              <Text style={styles.blackoutBtnText}>Báo bận / Thi</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* BENTO DASHBOARD TỔNG QUAN TUẦN */}
        <View style={styles.dashboardBento}>
          {/* AI Banner */}
          <View style={styles.aiRadarBox}>
            <View style={styles.aiRadarHeader}>
              <View style={styles.aiRadarTitleWrap}>
                <Ionicons name="radio" size={18} color="#00714C" />
                <Text style={styles.aiRadarTitle}>Radar AI Đang Tìm Kiếm Việc Làm Cho Bạn</Text>
              </View>
              <View style={styles.radiusPill}>
                <View style={styles.radiusDot} />
                <Text style={styles.radiusText}>Bán kính 10km</Text>
              </View>
            </View>
            <Text style={styles.aiRadarDesc}>
              Khi bạn mở lịch rảnh, thuật toán AI EduCareLink sẽ tự động đối soát kỹ năng sư phạm, vị trí GPS và khung giờ của bạn để ưu tiên đưa hồ sơ lên đầu bảng cho phụ huynh.
            </Text>
          </View>

          {/* Weekly Potential */}
          <View style={styles.earningRow}>
            <View style={styles.earningCol}>
              <View style={styles.earningLabelWrap}>
                <Ionicons name="cash-outline" size={15} color="#855300" />
                <Text style={styles.earningLabel}>Thu nhập tuần ước tính</Text>
              </View>
              <Text style={styles.earningAmount}>{weeklyEarningsEstimate}</Text>
              <Text style={styles.earningSub}>
                Dựa trên <Text style={styles.boldText}>{totalWeeklyHours}h rảnh</Text> đã mở · Đơn giá 80k–120k/h
              </Text>
            </View>
            <View style={styles.readinessWrap}>
              <View style={styles.readinessPill}>
                <View style={styles.readinessDot} />
                <Text style={styles.readinessText}>AI Sẵn Sàng Ghép</Text>
              </View>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(100, Math.max(10, parseFloat(totalWeeklyHours) * 5))}%` },
              ]}
            />
          </View>

          {/* AI Tip */}
          <View style={styles.aiTipBox}>
            <Ionicons name="sparkles" size={16} color={COLORS.primary} style={styles.aiTipIcon} />
            <Text style={styles.aiTipText}>
              <Text style={styles.aiTipBold}>Gợi ý thông minh: </Text>
              Mở thêm 2h tối Thứ 6 hoặc Chủ Nhật để tăng <Text style={styles.greenBold}>+20% cơ hội</Text> nhận ca kèm gần trường.
            </Text>
          </View>
        </View>

        {/* HORIZONTAL WEEKDAY SELECTOR */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWithIcon}>
              <Ionicons name="calendar" size={18} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Chọn ngày trong tuần</Text>
            </View>
            <Text style={styles.sectionMeta}>Tuần này</Text>
          </View>

          <View style={styles.weekdayGrid}>
            {weekDates.map((item) => {
              const isSelected = weekday === item.value;
              const count = slotCountByWeekday[item.value] || 0;
              const hasSlots = count > 0;

              return (
                <TouchableOpacity
                  key={item.value}
                  style={[styles.weekdayCard, isSelected && styles.weekdayCardActive]}
                  onPress={() => setWeekday(item.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.weekdayShortText, isSelected && styles.weekdayShortTextActive]}>
                    {item.short}
                  </Text>
                  <Text style={[styles.weekdayDateNum, isSelected && styles.weekdayDateNumActive]}>
                    {item.dateNum}
                  </Text>
                  <View
                    style={[
                      styles.slotIndicatorDot,
                      hasSlots ? (isSelected ? styles.slotDotWhite : styles.slotDotGreen) : styles.slotDotGray,
                    ]}
                  />
                  <Text style={[styles.weekdaySlotCount, isSelected && styles.weekdaySlotCountActive]}>
                    {hasSlots ? `${count} ca` : 'Trống'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 1-TAP QUICK PRESETS */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWithIcon}>
              <Ionicons name="flash" size={16} color="#855300" />
              <Text style={styles.presetSectionTitle}>CHỌN NHANH KHUNG GIỜ PHỔ BIẾN</Text>
            </View>
            <Text style={styles.presetHintText}>Chạm để điền</Text>
          </View>

          <View style={styles.presetGrid}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.presetCard, p.isPeak && styles.presetCardPeak]}
                onPress={() => applyPreset(p.start, p.end)}
                activeOpacity={0.8}
              >
                <View style={styles.presetCardHeader}>
                  <View style={[styles.presetBadge, p.isPeak && styles.presetBadgePeak]}>
                    {p.badge && <Ionicons name="flame" size={12} color="#855300" style={{ marginRight: 2 }} />}
                    <Text style={[styles.presetBadgeText, p.isPeak && styles.presetBadgeTextPeak]}>
                      {p.name}
                    </Text>
                  </View>
                  <Text style={styles.presetDurationText}>{p.duration}</Text>
                </View>
                <Text style={styles.presetTimeRange}>
                  {p.start} – {p.end}
                </Text>
                <Text style={styles.presetDesc} numberOfLines={1}>
                  {p.desc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* REGISTERED SLOTS FOR SELECTED DAY */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.dayScheduleTitle}>
                Lịch {selectedDayInfo.label}
              </Text>
              <Text style={styles.dayScheduleSub}>
                {dayWindows.length} khung giờ đã mở · {dayTotalHours} tiếng rảnh
              </Text>
            </View>
            {dayWindows.length > 0 && (
              <View style={styles.highAvailabilityPill}>
                <Text style={styles.highAvailabilityText}>Khả dụng cao</Text>
              </View>
            )}
          </View>

          {loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 24 }} />
          ) : loadError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={28} color="#DC2626" />
              <Text style={styles.errorBoxText}>{loadError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={load}>
                <Text style={styles.retryBtnText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : dayWindows.length === 0 ? (
            <View style={styles.emptyDayBox}>
              <Ionicons name="calendar-outline" size={40} color="#CBD5E1" />
              <Text style={styles.emptyDayTitle}>Chưa mở khung giờ nào cho {selectedDayInfo.label}</Text>
              <Text style={styles.emptyDaySub}>
                Hãy dùng bộ chọn giờ bên dưới hoặc bấm các khung giờ vàng để AI tìm việc cho bạn.
              </Text>
            </View>
          ) : (
            <View style={styles.slotsList}>
              {dayWindows.map((w) => {
                const isLocked = !!w.is_locked;
                return (
                  <View
                    key={w.id}
                    style={[styles.slotCard, isLocked && styles.slotCardLocked]}
                  >
                    <View style={[styles.slotCardBar, isLocked ? styles.barLocked : styles.barOpen]} />
                    <View style={styles.slotCardContent}>
                      <View style={styles.slotMainRow}>
                        <View style={styles.slotTimeCol}>
                          <View style={styles.slotTimeTextRow}>
                            <Text style={styles.slotTimeRange}>
                              {w.time_from.slice(0, 5)} – {w.time_to.slice(0, 5)}
                            </Text>
                            <Text style={styles.slotHourUnit}>
                              ({calculateDuration(w.time_from, w.time_to)} tiếng)
                            </Text>
                          </View>

                          <View style={styles.slotStatusPillRow}>
                            {isLocked ? (
                              <View style={styles.lockedBadge}>
                                <Ionicons name="lock-closed" size={12} color={COLORS.primary} style={{ marginRight: 4 }} />
                                <Text style={styles.lockedBadgeText}>AI Đã Ghép Đơn (Đã Khóa Lịch)</Text>
                              </View>
                            ) : (
                              <View style={styles.openBadge}>
                                <View style={styles.openDot} />
                                <Text style={styles.openBadgeText}>AI Đang Tìm Phụ Huynh Phù Hợp</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {isLocked ? (
                          <View style={styles.verifiedCircle}>
                            <Ionicons name="checkmark-circle" size={20} color="#00714C" />
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.deleteSlotBtn}
                            onPress={() => removeSlot(w)}
                            disabled={deletingId === w.id}
                            accessibilityLabel="Xóa khung giờ rảnh"
                          >
                            {deletingId === w.id ? (
                              <ActivityIndicator size="small" color="#DC2626" />
                            ) : (
                              <Ionicons name="trash-outline" size={19} color="#94A3B8" />
                            )}
                          </TouchableOpacity>
                        )}
                      </View>

                      {isLocked ? (
                        <View style={styles.slotFootnote}>
                          <Ionicons name="shield-checkmark" size={13} color="#00714C" />
                          <Text style={styles.slotFootnoteText}>
                            Ca làm đã cam kết. Điểm tín nhiệm đối tác của bạn đạt 100/100.
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.slotEstimateRow}>
                          <Text style={styles.slotEstimateText}>
                            Ước tính thu nhập: {calculateEstimatedIncome(w.time_from, w.time_to)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* CUSTOM TIME SLOT STEPPER */}
        <View style={styles.customSlotSection}>
          <View style={styles.customSlotHeader}>
            <View style={styles.sectionTitleWithIcon}>
              <Ionicons name="add-circle" size={20} color={COLORS.primary} />
              <Text style={styles.customSlotTitle}>Thêm khung giờ linh hoạt</Text>
            </View>
            <Text style={styles.customSlotLimit}>Tối thiểu 1.0h</Text>
          </View>

          {/* Stepper Grid */}
          <View style={styles.stepperGrid}>
            {/* TỪ GIỜ */}
            <View style={styles.stepperBox}>
              <Text style={styles.stepperLabel}>TỪ GIỜ</Text>
              <View style={styles.stepperControlRow}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => adjustTime('start', -30)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="remove" size={18} color="#131B2E" />
                </TouchableOpacity>
                <Text style={styles.stepperValueText}>{minutesToStr(startMinutes)}</Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => adjustTime('start', 30)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={18} color="#131B2E" />
                </TouchableOpacity>
              </View>
            </View>

            {/* ĐẾN GIỜ */}
            <View style={styles.stepperBox}>
              <Text style={styles.stepperLabel}>ĐẾN GIỜ</Text>
              <View style={styles.stepperControlRow}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => adjustTime('end', -30)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="remove" size={18} color="#131B2E" />
                </TouchableOpacity>
                <Text style={styles.stepperValueText}>{minutesToStr(endMinutes)}</Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => adjustTime('end', 30)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={18} color="#131B2E" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Duration Summary */}
          <View style={styles.durationSummaryBox}>
            <View style={styles.durationSummaryLeft}>
              <Ionicons name="time" size={17} color="#00714C" />
              <Text style={styles.durationSummaryText}>Thời lượng: {stepperSummary.hours} tiếng</Text>
            </View>
            <Text style={styles.payoutSummaryText}>{stepperSummary.payoutText}</Text>
          </View>

          {/* Submit Slot Button */}
          <TouchableOpacity
            style={styles.addSlotButton}
            onPress={addSlot}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                <Text style={styles.addSlotButtonText}>LƯU KHUNG GIỜ NÀY</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.midnightNoticeRow}>
            <Ionicons name="information-circle-outline" size={15} color="#855300" style={{ marginTop: 1 }} />
            <Text style={styles.midnightNoticeText}>
              Nếu mở ca qua đêm (sau 22:00), hệ thống sẽ tự động tách 2 ca hợp lệ theo chuẩn an toàn EduCareLink.
            </Text>
          </View>
        </View>

        {/* COMMITMENT & TRUST POLICY NOTICE */}
        <View style={styles.policyCard}>
          <Ionicons name="shield-checkmark" size={24} color="#00714C" style={styles.policyIcon} />
          <View style={styles.policyTextCol}>
            <Text style={styles.policyTitle}>Cam kết minh bạch & Tự chủ thời gian</Text>
            <Text style={styles.policyDesc}>
              Bạn có thể cập nhật hoặc đóng khung giờ bất kỳ lúc nào trước khi có phụ huynh đặt lịch. Khi nhận yêu cầu khớp lịch từ AI, bạn luôn có{' '}
              <Text style={styles.boldText}>60 phút</Text> để xác nhận trước khi hệ thống khóa ca.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* MODAL QUY TẮC MỞ LỊCH */}
      <Modal
        visible={rulesModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRulesModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.primary} />
              <Text style={styles.modalTitle}>Quy tắc mở lịch EduCareLink</Text>
            </View>
            <View style={styles.modalBody}>
              <View style={styles.ruleItem}>
                <Text style={styles.ruleNum}>1.</Text>
                <Text style={styles.ruleText}>Mở tối thiểu 1.0 giờ cho mỗi ca làm việc để thuận tiện ghép đơn.</Text>
              </View>
              <View style={styles.ruleItem}>
                <Text style={styles.ruleNum}>2.</Text>
                <Text style={styles.ruleText}>Xác nhận đơn trong 60 phút khi AI đề xuất để giữ điểm uy tín 100/100.</Text>
              </View>
              <View style={styles.ruleItem}>
                <Text style={styles.ruleNum}>3.</Text>
                <Text style={styles.ruleText}>Chủ động đóng khung giờ trước 4 tiếng nếu có lịch học/thi đột xuất.</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setRulesModalVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>Đã hiểu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Hàm tính thời lượng hiển thị
function calculateDuration(timeFrom, timeTo) {
  if (!timeFrom || !timeTo) return '0.0';
  const [sh, sm] = timeFrom.slice(0, 5).split(':').map(Number);
  const [eh, em] = timeTo.slice(0, 5).split(':').map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return (diff / 60).toFixed(1);
}

// Hàm tính ước tính thu nhập từng ca
function calculateEstimatedIncome(timeFrom, timeTo) {
  const h = parseFloat(calculateDuration(timeFrom, timeTo));
  const minEarn = Math.round(h * 80);
  const maxEarn = Math.round(h * 120);
  return `${minEarn}k – ${maxEarn}k`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8FF',
  },
  appBar: {
    backgroundColor: 'rgba(250, 248, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    zIndex: 50,
  },
  appBarContent: {
    height: 72,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EAEDFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    paddingHorizontal: 6,
  },
  radarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0, 113, 76, 0.1)',
    borderColor: 'rgba(0, 113, 76, 0.2)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginBottom: 2,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00714C',
    marginRight: 6,
  },
  radarBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#00714C',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#131B2E',
    lineHeight: 22,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#594138',
    marginTop: 1,
  },
  supportBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EAEDFF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  supportStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00714C',
    position: 'absolute',
    top: 8,
    right: 8,
    borderWidth: 1.5,
    borderColor: '#FAF8FF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 110, // Để an toàn không che bottom tab
  },
  statusBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 113, 76, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 6,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#00714C',
  },
  onlineText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00714C',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EAEDFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blackoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2E7FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  blackoutBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#131B2E',
  },

  // Bento Dashboard
  dashboardBento: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    ...SHADOWS.small,
  },
  aiRadarBox: {
    backgroundColor: 'rgba(0, 113, 76, 0.08)',
    borderColor: 'rgba(0, 113, 76, 0.18)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  aiRadarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  aiRadarTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  aiRadarTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00714C',
    flex: 1,
  },
  radiusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 113, 76, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  radiusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#00714C',
  },
  radiusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#00714C',
  },
  aiRadarDesc: {
    fontSize: 12,
    color: '#131B2E',
    lineHeight: 18,
  },
  earningRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  earningCol: {
    flex: 1,
  },
  earningLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  earningLabel: {
    fontSize: 12,
    color: '#594138',
    fontWeight: '500',
  },
  earningAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#00714C',
    letterSpacing: -0.5,
  },
  earningSub: {
    fontSize: 12,
    color: '#594138',
    marginTop: 2,
  },
  readinessWrap: {
    alignItems: 'flex-end',
  },
  readinessPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 113, 76, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 5,
  },
  readinessDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00714C',
  },
  readinessText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00714C',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#EAEDFF',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  aiTipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F2F3FF',
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  aiTipIcon: {
    marginTop: 2,
  },
  aiTipText: {
    flex: 1,
    fontSize: 12,
    color: '#131B2E',
    lineHeight: 18,
  },
  aiTipBold: {
    fontWeight: '700',
    color: COLORS.primary,
  },
  greenBold: {
    fontWeight: '700',
    color: '#00714C',
  },
  boldText: {
    fontWeight: '700',
    color: '#131B2E',
  },

  // Weekday Section
  sectionWrap: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#131B2E',
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#00714C',
  },
  weekdayGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  weekdayCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    ...SHADOWS.small,
  },
  weekdayCardActive: {
    backgroundColor: COLORS.primary,
    transform: [{ scale: 1.04 }],
  },
  weekdayShortText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#594138',
  },
  weekdayShortTextActive: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  weekdayDateNum: {
    fontSize: 16,
    fontWeight: '700',
    color: '#131B2E',
    marginVertical: 2,
  },
  weekdayDateNumActive: {
    color: '#FFFFFF',
  },
  slotIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginVertical: 3,
  },
  slotDotGreen: {
    backgroundColor: '#00714C',
  },
  slotDotWhite: {
    backgroundColor: '#FFFFFF',
  },
  slotDotGray: {
    backgroundColor: '#DAE2FD',
  },
  weekdaySlotCount: {
    fontSize: 9,
    fontWeight: '600',
    color: '#594138',
  },
  weekdaySlotCountActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Presets
  presetSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#594138',
    letterSpacing: 0.5,
  },
  presetHintText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#855300',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetCard: {
    width: (SCREEN_WIDTH - 40) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    ...SHADOWS.small,
  },
  presetCardPeak: {
    backgroundColor: '#FFFDF5',
    borderColor: '#FFDD78',
    borderWidth: 1,
  },
  presetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  presetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAEDFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  presetBadgePeak: {
    backgroundColor: 'rgba(202, 129, 0, 0.15)',
  },
  presetBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#594138',
  },
  presetBadgeTextPeak: {
    color: '#855300',
  },
  presetDurationText: {
    fontSize: 11,
    color: '#594138',
    fontWeight: '600',
  },
  presetTimeRange: {
    fontSize: 15,
    fontWeight: '700',
    color: '#131B2E',
    marginBottom: 2,
  },
  presetDesc: {
    fontSize: 11,
    color: '#594138',
  },

  // Day Schedule List
  dayScheduleTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#131B2E',
  },
  dayScheduleSub: {
    fontSize: 12,
    color: '#594138',
    marginTop: 2,
  },
  highAvailabilityPill: {
    backgroundColor: 'rgba(0, 113, 76, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  highAvailabilityText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00714C',
  },
  slotsList: {
    gap: 10,
    marginTop: 6,
  },
  slotCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  slotCardLocked: {
    backgroundColor: '#F8FAFF',
    borderColor: '#E2E7FF',
    borderWidth: 1,
  },
  slotCardBar: {
    width: 5,
  },
  barOpen: {
    backgroundColor: '#00714C',
  },
  barLocked: {
    backgroundColor: COLORS.primary,
  },
  slotCardContent: {
    flex: 1,
    padding: 12,
  },
  slotMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  slotTimeCol: {
    flex: 1,
  },
  slotTimeTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slotTimeRange: {
    fontSize: 16,
    fontWeight: '700',
    color: '#131B2E',
  },
  slotHourUnit: {
    fontSize: 12,
    color: '#594138',
    fontWeight: '500',
  },
  slotStatusPillRow: {
    marginTop: 4,
  },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 113, 76, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
    gap: 4,
  },
  openDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#00714C',
  },
  openBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00714C',
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(242, 101, 34, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  lockedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  deleteSlotBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  verifiedCircle: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotEstimateRow: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  slotEstimateText: {
    fontSize: 11,
    color: '#594138',
  },
  slotFootnote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  slotFootnoteText: {
    fontSize: 11,
    color: '#00714C',
    fontWeight: '500',
  },
  emptyDayBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  emptyDayTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#131B2E',
    marginTop: 10,
    textAlign: 'center',
  },
  emptyDaySub: {
    fontSize: 12,
    color: '#594138',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  errorBox: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
  },
  errorBoxText: {
    fontSize: 13,
    color: '#DC2626',
    textAlign: 'center',
    marginTop: 6,
  },
  retryBtn: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },

  // Custom Stepper Box
  customSlotSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    ...SHADOWS.small,
  },
  customSlotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  customSlotTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#131B2E',
  },
  customSlotLimit: {
    fontSize: 12,
    color: '#594138',
  },
  stepperGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  stepperBox: {
    flex: 1,
    backgroundColor: '#F2F3FF',
    borderRadius: 14,
    padding: 12,
  },
  stepperLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#594138',
    marginBottom: 6,
  },
  stepperControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  stepperValueText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#131B2E',
  },
  durationSummaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 113, 76, 0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  durationSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  durationSummaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00714C',
  },
  payoutSummaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#00714C',
  },
  addSlotButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addSlotButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  midnightNoticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
  },
  midnightNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#594138',
    lineHeight: 16,
  },

  // Policy Card
  policyCard: {
    flexDirection: 'row',
    backgroundColor: '#F2F3FF',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    alignItems: 'flex-start',
  },
  policyIcon: {
    marginTop: 2,
  },
  policyTextCol: {
    flex: 1,
  },
  policyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#131B2E',
    marginBottom: 2,
  },
  policyDesc: {
    fontSize: 12,
    color: '#594138',
    lineHeight: 18,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    ...SHADOWS.medium,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#131B2E',
  },
  modalBody: {
    gap: 10,
    marginBottom: 18,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  ruleNum: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  ruleText: {
    flex: 1,
    fontSize: 13,
    color: '#594138',
    lineHeight: 18,
  },
  modalCloseBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
