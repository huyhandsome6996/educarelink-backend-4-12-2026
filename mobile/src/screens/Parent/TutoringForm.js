// ============================================================
// TutoringForm — Flow 1 Step 1 §A: Đăng việc GIA SƯ & KÈM HỌC
// Môn học là TEXT TỰ DO: chấp nhận kỹ năng (MC, kỹ năng sống, đàn, vẽ...)
// Redesign theo bản thiết kế chuẩn Google Stitch (Mobile Consumer App)
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
import { createJob, publishJob } from '../../api/matching';
import JobLocationPicker from '../../components/JobLocationPicker';
import { formatDateToYMD, getTodayYMD, extractErrorMessage } from '../../utils/date';

// DateTimePicker chỉ trên native
let DateTimePicker;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

const QUICK_SUBJECTS = [
  '📐 Toán lớp 5',
  '🇬🇧 Tiếng Anh giao tiếp',
  '✍️ Luyện chữ đẹp',
  '🎹 Đàn Piano / Organ',
  '🎨 Vẽ & Sáng tạo',
  '🎤 MC nhí & Tự tin',
];

const QUICK_TAGS = [
  'Kiên nhẫn',
  'Gia sư nữ',
  'ĐH Sư Phạm',
  'Ôn thi học kỳ',
  'Có xe máy',
];

export default function TutoringForm() {
  const navigation = useNavigation();
  const [subject, setSubject] = useState('');
  const [requirements, setRequirements] = useState('');
  const [dates, setDates] = useState([]); // 'YYYY-MM-DD'
  const [timeFrom, setTimeFrom] = useState('19:00');
  const [timeTo, setTimeTo] = useState('21:00');
  const [rate, setRate] = useState('120000');
  const [location, setLocation] = useState(null); // {latitude, longitude}
  const [locationNote, setLocationNote] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Safe area insets with fallback for test runners
  let insets = { top: 12, bottom: 20, left: 0, right: 0 };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const safeInsets = useSafeAreaInsets();
    if (safeInsets) insets = safeInsets;
  } catch {
    // Fallback when outside SafeAreaProvider
  }

  const addDate = (_event, selected) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (!selected) return;
    const iso = formatDateToYMD(selected);
    const today = getTodayYMD();
    if (iso < today) {
      Alert.alert('Không hợp lệ', 'Không được chọn ngày trong quá khứ.');
      return;
    }
    if (!dates.includes(iso)) setDates([...dates, iso].sort());
  };

  const handleRateAdjust = (amount) => {
    const current = Number(rate) || 120000;
    const updated = Math.max(40000, current + amount);
    setRate(updated.toString());
  };

  const handleTagToggle = (tag) => {
    if (!requirements.includes(tag)) {
      setRequirements((prev) => (prev.trim() ? `${prev.trim()}, ${tag}` : tag));
    }
  };

  const handleDurationPreset = (hours) => {
    // Tự động tính toán timeTo dựa theo timeFrom
    try {
      const [h, m] = (timeFrom || '19:00').split(':').map(Number);
      const totalMinutes = h * 60 + m + hours * 60;
      const endH = Math.floor(totalMinutes / 60) % 24;
      const endM = totalMinutes % 60;
      const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      setTimeTo(endStr);
    } catch {
      setTimeTo('21:00');
    }
  };

  const submit = async () => {
    if (!subject.trim()) return Alert.alert('Thiếu thông tin', 'Vui lòng nhập môn học / kỹ năng.');
    if (dates.length === 0) return Alert.alert('Thiếu thông tin', 'Vui lòng chọn ít nhất 1 ngày học.');
    if (!timeFrom || !timeTo || timeTo <= timeFrom)
      return Alert.alert('Thiếu thông tin', 'Giờ kết thúc phải sau giờ bắt đầu.');
    if (!location) return Alert.alert('Thiếu thông tin', 'Vui lòng chọn vị trí trên bản đồ.');
    if (!rate || Number(rate) <= 0)
      return Alert.alert('Thiếu thông tin', 'Vui lòng nhập học phí/giờ (VNĐ > 0).');

    // Tự động điền yêu cầu mặc định nếu phụ huynh chưa kịp nhập
    const finalRequirements =
      requirements.trim() ||
      `Dạy kèm môn ${subject.trim()}, hướng dẫn bài tập và hỗ trợ bé rèn luyện kiến thức vững vàng.`;

    setSubmitting(true);
    try {
      const { data: job } = await createJob({
        job_type: 'tutoring',
        subject: subject.trim(),
        specific_requirements: finalRequirements,
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
        [
          {
            text: 'Xem ứng viên',
            onPress: () => navigation.navigate('CandidatesList', { jobId: job.id }),
          },
          { text: 'Để sau', style: 'cancel' },
        ]
      );
    } catch (err) {
      const msg = extractErrorMessage(err, 'Không đăng được bài. Vui lòng kiểm tra lại thông tin.');
      Alert.alert('Lỗi', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const estimatedPerSession = (Number(rate) || 120000) * 2;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* 1. TOP APP BAR */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 10) }]}>
        <TouchableOpacity
          style={styles.circleBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <Text style={styles.topBarTitle}>Gia sư & Kèm học</Text>
          <View style={styles.subTitleWrap}>
            <View style={styles.dotIndicator} />
            <Text style={styles.topBarSub}>Bước 1/2 · Thiết lập ca học</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.circleBtn}
          onPress={() =>
            Alert.alert(
              'Gia sư EduCareLink',
              '• 100% CarePartner được đối soát thẻ sinh viên và CCCD.\n• Học phí được ký quỹ an toàn, chỉ giải ngân khi phụ huynh hài lòng.',
              [{ text: 'Đã hiểu', style: 'default' }]
            )
          }
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="information-circle-outline" size={22} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* 2. SCROLLABLE FORM CONTENT */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Service Hero Banner */}
        <View style={styles.heroBanner}>
          <View style={styles.heroIconBox}>
            <Ionicons name="school" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.heroTag}>
              <Text style={styles.heroTagText}>CHUYÊN MỤC KÈM HỌC</Text>
            </View>
            <Text style={styles.heroTitle}>Tìm gia sư sinh viên giỏi & tận tâm</Text>
            <View style={styles.heroVerifyRow}>
              <Ionicons name="shield-checkmark" size={14} color="#10B981" />
              <Text style={styles.heroVerifyText}>100% đối soát CCCD & Thẻ SV ĐH Top (Bách Khoa, Sư Phạm...)</Text>
            </View>
          </View>
        </View>

        {/* SECTION 1: MÔN HỌC & KỸ NĂNG */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>
              Môn học hoặc Kỹ năng bé cần học <Text style={styles.star}>*</Text>
            </Text>
            <Text style={styles.helperHint}>Tùy chọn đa dạng</Text>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="VD: Toán lớp 5, Tiếng Anh giao tiếp, Đàn Piano..."
              placeholderTextColor="#94A3B8"
              value={subject}
              onChangeText={setSubject}
            />
            {!!subject && (
              <TouchableOpacity onPress={() => setSubject('')}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Quick Select Chips */}
          <Text style={styles.subHint}>Gợi ý chọn nhanh môn học:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            {QUICK_SUBJECTS.map((s, idx) => {
              const clean = s.replace(/^[^\w\s]*\s*/, '');
              const isSelected = subject.includes(clean);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.quickChip, isSelected && styles.quickChipActive]}
                  onPress={() => setSubject(clean)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.quickChipText, isSelected && styles.quickChipTextActive]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* SECTION 2: ĐẶC ĐIỂM BÉ & YÊU CẦU CỤ THỂ */}
        <View style={styles.sectionCard}>
          <Text style={styles.label}>
            Yêu cầu gia sư & Tính cách của bé <Text style={styles.star}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="VD: Bé hơi nhút nhát và chưa tập trung, cần gia sư kiên nhẫn và biết tạo không khí hứng khởi, ưu tiên nữ sinh viên ĐH Sư Phạm..."
            placeholderTextColor="#94A3B8"
            value={requirements}
            onChangeText={setRequirements}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.subHint}>Chạm để thêm nhanh tiêu chí quan trọng:</Text>
          <View style={styles.tagWrap}>
            {QUICK_TAGS.map((tag, idx) => {
              const isAdded = requirements.includes(tag);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.tagChip, isAdded && styles.tagChipActive]}
                  onPress={() => handleTagToggle(tag)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tagChipText, isAdded && styles.tagChipTextActive]}>
                    {isAdded ? `✓ ${tag}` : `+ ${tag}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* SECTION 3: LỊCH HỌC & THỜI GIAN */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>
              Ngày học trong tuần <Text style={styles.star}>*</Text>
            </Text>
            <Text style={[styles.helperHint, { color: '#F26522', fontWeight: '700' }]}>
              {dates.length > 0 ? `${dates.length} buổi đã chọn` : 'Chưa chọn ngày'}
            </Text>
          </View>

          <View style={styles.datesContainer}>
            {dates.map((d) => (
              <View key={d} style={styles.dateChip}>
                <Ionicons name="calendar-outline" size={13} color="#F26522" />
                <Text style={styles.dateChipText}>{d}</Text>
                <TouchableOpacity onPress={() => setDates(dates.filter((x) => x !== d))}>
                  <Ionicons name="close" size={14} color="#EA580C" />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={styles.addDateBtn}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={15} color="#F26522" />
              <Text style={styles.addDateBtnText}>Thêm ngày học</Text>
            </TouchableOpacity>
          </View>

          {showDatePicker && DateTimePicker && (
            <DateTimePicker value={new Date()} mode="date" onChange={addDate} />
          )}

          {/* Time Slot Row */}
          <View style={styles.timeGrid}>
            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>Bắt đầu từ</Text>
              <View style={styles.timeInputBox}>
                <Ionicons name="time-outline" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.timeInput}
                  value={timeFrom}
                  onChangeText={setTimeFrom}
                  placeholder="19:00"
                />
              </View>
            </View>

            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>Kết thúc lúc</Text>
              <View style={styles.timeInputBox}>
                <Ionicons name="time-outline" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.timeInput}
                  value={timeTo}
                  onChangeText={setTimeTo}
                  placeholder="21:00"
                />
              </View>
            </View>
          </View>

          {/* Quick Duration Presets */}
          <View style={styles.presetsRow}>
            <Text style={styles.presetLabel}>Thời lượng ca:</Text>
            <TouchableOpacity style={styles.presetBtn} onPress={() => handleDurationPreset(1.5)}>
              <Text style={styles.presetBtnText}>1.5 giờ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.presetBtn, styles.presetBtnActive]}
              onPress={() => handleDurationPreset(2)}
            >
              <Text style={[styles.presetBtnText, styles.presetBtnTextActive]}>2 giờ (Chuẩn)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.presetBtn} onPress={() => handleDurationPreset(2.5)}>
              <Text style={styles.presetBtnText}>2.5 giờ</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SECTION 4: HỌC PHÍ ĐỀ XUẤT */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>
              Học phí đề xuất / giờ (VNĐ) <Text style={styles.star}>*</Text>
            </Text>
            <View style={styles.benchmarkBadge}>
              <Text style={styles.benchmarkBadgeText}>Tối ưu tỷ lệ ghép</Text>
            </View>
          </View>

          <View style={styles.rateRow}>
            <View style={styles.rateInputWrap}>
              <TextInput
                style={styles.rateInput}
                placeholder="120000"
                value={rate}
                onChangeText={setRate}
                keyboardType="numeric"
              />
              <Text style={styles.rateSuffix}>đ / giờ</Text>
            </View>

            <View style={styles.stepperWrap}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => handleRateAdjust(-10000)}
                activeOpacity={0.7}
              >
                <Text style={styles.stepperBtnText}>－</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => handleRateAdjust(10000)}
                activeOpacity={0.7}
              >
                <Text style={styles.stepperBtnText}>＋</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Benchmark Helper Box */}
          <View style={styles.benchmarkBox}>
            <View style={styles.benchmarkIcon}>
              <Text style={{ fontSize: 11, color: '#FFFFFF', fontWeight: '800' }}>✓</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.benchmarkTitle}>Khung giá thị trường gợi ý: 100.000đ – 140.000đ/giờ</Text>
              <Text style={styles.benchmarkDesc}>
                Mức giá này nằm trong dải chuẩn. Hệ thống dự kiến sẽ có 6 - 8 sinh viên giỏi nhận lời trong 15 phút.
              </Text>
            </View>
          </View>
        </View>

        {/* SECTION 5: ĐỊA ĐIỂM DẠY HỌC */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>
              Địa điểm dạy học <Text style={styles.star}>*</Text>
            </Text>
            <Text style={styles.helperHint}>Tại nhà phụ huynh</Text>
          </View>

          <JobLocationPicker value={location} onChange={setLocation} />

          <View style={{ marginTop: 10 }}>
            <Text style={styles.subHint}>Chi tiết số phòng / Tầng (Chung cư, ngõ hẻm):</Text>
            <TextInput
              style={styles.input}
              placeholder="VD: Phòng 602, Chung cư Sunrise Tây Hồ (Bấm chuông 602)..."
              placeholderTextColor="#94A3B8"
              value={locationNote}
              onChangeText={setLocationNote}
            />
          </View>
        </View>

        {/* Trust Assurance Mini Badge */}
        <View style={styles.trustBanner}>
          <Ionicons name="shield-checkmark" size={15} color="#10B981" />
          <Text style={styles.trustBannerText}>Khoản cọc được giữ an toàn bởi EduCareLink Guarantee</Text>
        </View>
      </ScrollView>

      {/* 3. STICKY BOTTOM ACTION DOCK */}
      <View style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.dockLeft}>
          <Text style={styles.dockSub}>Tạm tính 1 ca (2h):</Text>
          <Text style={styles.dockPrice}>
            ~{estimatedPerSession.toLocaleString('vi-VN')}
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>đ</Text>
          </Text>
          <View style={styles.guaranteePill}>
            <View style={styles.guaranteeDot} />
            <Text style={styles.guaranteeText}>Bảo vệ hoàn tiền 100%</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.dockCtaBtn, submitting && { opacity: 0.6 }]}
          onPress={submit}
          disabled={submitting}
          activeOpacity={0.88}
        >
          <View style={styles.ctaTextWrap}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.ctaTitle}>{submitting ? 'Đang đăng...' : 'Đăng việc & Tìm gia sư'}</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </View>
            <Text style={styles.ctaSub}>AI ghép cặp 8 bạn SV tốt nhất</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // 1. TOP APP BAR
  topBar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...SHADOWS.small,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  titleWrap: {
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  subTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F26522',
  },
  topBarSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },

  // 2. SCROLLABLE CONTENT
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  heroBanner: {
    backgroundColor: '#FFF4ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 18,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    ...SHADOWS.small,
  },
  heroIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F26522',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  heroTag: {
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  heroTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#EA580C',
  },
  heroTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 3,
  },
  heroVerifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  heroVerifyText: {
    fontSize: 10.5,
    color: '#475569',
    fontWeight: '500',
    flex: 1,
  },

  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    ...SHADOWS.small,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  star: {
    color: '#F26522',
    fontWeight: '800',
  },
  helperHint: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  subHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 8,
    marginBottom: 6,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 6,
  },
  chipsScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  quickChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  quickChipActive: {
    backgroundColor: '#FFF4ED',
    borderColor: '#FED7AA',
  },
  quickChipText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  quickChipTextActive: {
    color: '#F26522',
    fontWeight: '800',
  },

  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  textarea: {
    height: 75,
    textAlignVertical: 'top',
    lineHeight: 18,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  tagChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tagChipActive: {
    backgroundColor: '#FFF4ED',
    borderColor: '#FED7AA',
  },
  tagChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  tagChipTextActive: {
    color: '#C2410C',
    fontWeight: '800',
  },

  datesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
  },
  dateChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#9A3412',
  },
  addDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#F26522',
    borderStyle: 'dashed',
    backgroundColor: '#FFF4ED',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  addDateBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#F26522',
  },

  timeGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  timeCol: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  timeInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  timeInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    paddingVertical: 4,
  },
  presetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  presetLabel: {
    fontSize: 10.5,
    color: '#64748B',
  },
  presetBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  presetBtnActive: {
    backgroundColor: '#FFF4ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  presetBtnText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
  },
  presetBtnTextActive: {
    color: '#F26522',
    fontWeight: '800',
  },

  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rateInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  rateInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    paddingVertical: 8,
  },
  rateSuffix: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  stepperBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  benchmarkBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  benchmarkBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
  },
  benchmarkBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    gap: 8,
  },
  benchmarkIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  benchmarkTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#065F46',
  },
  benchmarkDesc: {
    fontSize: 10.5,
    color: '#047857',
    marginTop: 2,
    lineHeight: 14,
  },

  trustBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  trustBannerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },

  // 3. STICKY BOTTOM DOCK
  bottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    ...SHADOWS.medium,
  },
  dockLeft: {
    flexShrink: 0,
  },
  dockSub: {
    fontSize: 10,
    color: '#64748B',
  },
  dockPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
  },
  guaranteePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  guaranteeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  guaranteeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#047857',
  },
  dockCtaBtn: {
    flex: 1,
    backgroundColor: '#F26522',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  ctaTextWrap: {
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ctaSub: {
    fontSize: 9.5,
    color: '#FED7AA',
    marginTop: 1,
  },
});
