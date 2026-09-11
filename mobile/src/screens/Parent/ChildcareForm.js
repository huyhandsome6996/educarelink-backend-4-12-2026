// ============================================================
// ChildcareForm — Flow 1 Step 1 §B: Đăng việc TRÔNG TRẺ TẠI NHÀ
// child_age_group + number_of_children + care_duties (multi-select)
// + medical_allergy_notes + specific_requirements + dates/time/location
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

let DateTimePicker;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

// 5 nhóm tuổi chuẩn theo đặc tả Mục 2 (backend job_schema.CHILD_AGE_GROUPS)
const AGE_GROUPS = [
  { code: '0_to_12_months', label: '0 - 12 tháng', sub: 'Sơ sinh & ăn dặm', icon: '🍼' },
  { code: '1_to_3_years', label: '1 - 3 tuổi', sub: 'Tập đi / Nhà trẻ', icon: '🧸' },
  { code: '3_to_6_years', label: '3 - 6 tuổi', sub: 'Lớp Mầm / Mẫu giáo', icon: '🎨' },
  { code: '6_to_10_years', label: '6 - 10 tuổi', sub: 'Tiểu học & bài tập', icon: '📚' },
  { code: 'over_10_years', label: 'Trên 10 tuổi', sub: 'Kèm học & kỹ năng', icon: '🧒' },
];

// 7 việc chăm sóc trẻ chuẩn theo đặc tả Mục 2 (backend job_schema.CARE_DUTIES)
const DUTIES = [
  { code: 'general_care', label: 'Chăm sóc chung', icon: '🌟' },
  { code: 'feeding', label: 'Cho ăn / Ăn dặm', icon: '🥣' },
  { code: 'bathing', label: 'Tắm rửa & Vệ sinh', icon: '🛁' },
  { code: 'sleep_monitoring', label: 'Trông giấc ngủ', icon: '😴' },
  { code: 'play_activities', label: 'Vui chơi & Vận động', icon: '🧩' },
  { code: 'homework_help', label: 'Hỗ trợ bài tập', icon: '📖' },
  { code: 'light_chores', label: 'Rửa bình & dọn đồ chơi', icon: '🍼' },
];

const QUICK_REQUIREMENTS = [
  'Không dùng ĐT khi trông',
  'Biết sơ cứu bé',
  'Có bằng Mầm non',
  'Kể chuyện đọc sách',
];

export default function ChildcareForm() {
  const navigation = useNavigation();
  const [ageGroup, setAgeGroup] = useState('1_to_3_years');
  const [numChildren, setNumChildren] = useState('1');
  const [duties, setDuties] = useState(['general_care', 'feeding', 'sleep_monitoring', 'play_activities']);
  const [allergyNotes, setAllergyNotes] = useState('');
  const [requirements, setRequirements] = useState('');
  const [dates, setDates] = useState([]);
  const [timeFrom, setTimeFrom] = useState('08:00');
  const [timeTo, setTimeTo] = useState('17:00');
  const [rate, setRate] = useState('80000');
  const [location, setLocation] = useState(null);
  const [locationNote, setLocationNote] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Safe area insets with fallback
  let insets = { top: 12, bottom: 20, left: 0, right: 0 };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const safeInsets = useSafeAreaInsets();
    if (safeInsets) insets = safeInsets;
  } catch {
    // Fallback when outside SafeAreaProvider
  }

  const toggleDuty = (code) =>
    setDuties((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]
    );

  const handleRequirementTag = (tag) => {
    if (!requirements.includes(tag)) {
      setRequirements((prev) => (prev.trim() ? `${prev.trim()}, ${tag}` : tag));
    }
  };

  const addDate = (_e, selected) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (!selected) return;
    const iso = formatDateToYMD(selected);
    const today = getTodayYMD();
    if (iso < today)
      return Alert.alert('Không hợp lệ', 'Không được chọn ngày trong quá khứ.');
    if (!dates.includes(iso)) setDates([...dates, iso].sort());
  };

  const handleAdjustChildren = (delta) => {
    const current = Number(numChildren) || 1;
    const next = Math.max(1, Math.min(5, current + delta));
    setNumChildren(next.toString());
  };

  const submit = async () => {
    if (!ageGroup) return Alert.alert('Thiếu thông tin', 'Vui lòng chọn độ tuổi của trẻ.');
    if (Number(numChildren) < 1) return Alert.alert('Thiếu thông tin', 'Số lượng trẻ phải từ 1 trở lên.');
    if (duties.length === 0) return Alert.alert('Thiếu thông tin', 'Chọn ít nhất 1 việc chăm sóc bé.');
    if (dates.length === 0) return Alert.alert('Thiếu thông tin', 'Vui lòng chọn ngày làm việc.');
    if (!location) return Alert.alert('Thiếu thông tin', 'Vui lòng chọn vị trí trên bản đồ.');
    if (!rate || Number(rate) <= 0) return Alert.alert('Thiếu thông tin', 'Nhập mức phí/giờ hợp lệ.');

    const finalRequirements =
      requirements.trim() || 'Chăm sóc, vui chơi tương tác và đảm bảo an toàn tuyệt đối cho bé.';

    setSubmitting(true);
    let createdJobId = null;
    try {
      const { data: job } = await createJob({
        job_type: 'childcare',
        child_age_group: ageGroup,
        number_of_children: Number(numChildren),
        care_duties: duties,
        medical_allergy_notes: allergyNotes.trim(),
        specific_requirements: finalRequirements,
        dates,
        time_from: timeFrom,
        time_to: timeTo,
        latitude: location.latitude,
        longitude: location.longitude,
        location_note: locationNote,
        hourly_rate_vnd: Number(rate),
      });
      createdJobId = job?.id;

      const { data: published } = await publishJob(job.id);
      Alert.alert(
        'Đã đăng bài',
        published.needs_admin_review
          ? 'Bài đăng đang chờ kiểm duyệt an toàn.'
          : 'Hệ thống đang tìm CarePartner phù hợp cho bé yêu của bạn.',
        [
          {
            text: 'Xem ứng viên',
            onPress: () => navigation.navigate('CandidatesList', { jobId: job.id }),
          },
          { text: 'Để sau', style: 'cancel' },
        ]
      );
    } catch (err) {
      if (createdJobId) {
        Alert.alert(
          'Đã tạo bài đăng',
          'Bài đăng đã được lưu trên hệ thống. Hệ thống AI đang tìm kiếm ứng viên phù hợp.',
          [
            {
              text: 'Xem ứng viên',
              onPress: () => navigation.navigate('CandidatesList', { jobId: createdJobId }),
            },
            { text: 'Đóng', style: 'cancel' },
          ]
        );
      } else {
        const msg = extractErrorMessage(err, 'Không đăng được bài. Vui lòng kiểm tra lại thông tin.');
        Alert.alert('Lỗi', msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Tính tạm tính: (Số giờ ca) x Số ngày x Giá
  const estimatedHours = 9;
  const estimatedDays = Math.max(1, dates.length);
  const estimatedTotal = estimatedHours * (Number(rate) || 80000) * estimatedDays;

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
          <Text style={styles.topBarTitle}>Trông trẻ tại nhà</Text>
          <View style={styles.subTitleWrap}>
            <View style={styles.dotIndicator} />
            <Text style={styles.topBarSub}>Bước 1/2 · Chi tiết ca chăm sóc</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.circleBtn}
          onPress={() =>
            Alert.alert(
              'Cam kết an toàn trông trẻ',
              '• 100% CarePartner xác thực CCCD gắn chip & lý lịch tư pháp sạch.\n• Có bảo hiểm hỗ trợ sự cố trong suốt thời gian làm việc.\n• Thanh toán qua ví an toàn, chỉ giải ngân khi phụ huynh xác nhận xong việc.',
              [{ text: 'Đã hiểu', style: 'default' }]
            )
          }
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="shield-checkmark-outline" size={20} color="#0D9488" />
        </TouchableOpacity>
      </View>

      {/* 2. SCROLLABLE FORM CONTENT */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero Banner: Warm & Safe Caregiver Intro */}
        <View style={styles.heroBanner}>
          <View style={styles.heroIconBox}>
            <Ionicons name="heart" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Bảo mẫu & Sinh viên chăm sóc tận tâm</Text>
            <Text style={styles.heroDesc}>
              Đối soát 100% CCCD gắn chip · Có chứng chỉ sơ cấp cứu & kinh nghiệm giữ trẻ chuẩn sư phạm.
            </Text>
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroPill}>
                <View style={styles.heroPillDot} />
                <Text style={styles.heroPillText}>Đã kiểm duyệt hồ sơ</Text>
              </View>
              <View style={[styles.heroPill, { backgroundColor: 'rgba(255,255,255,0.8)' }]}>
                <Text style={[styles.heroPillText, { color: '#475569' }]}>🛡️ Bảo hiểm sự cố</Text>
              </View>
            </View>
          </View>
        </View>

        {/* SECTION 1: ĐỘ TUỔI CỦA BÉ */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>
              Độ tuổi của trẻ <Text style={styles.star}>*</Text>
            </Text>
            <Text style={styles.helperHint}>Chọn 1 nhóm</Text>
          </View>

          <View style={styles.ageGrid}>
            {AGE_GROUPS.map((g) => {
              const isActive = ageGroup === g.code;
              return (
                <TouchableOpacity
                  key={g.code}
                  style={[styles.ageCard, isActive && styles.ageCardActive]}
                  onPress={() => setAgeGroup(g.code)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.ageIcon}>{g.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.ageLabel, isActive && styles.ageLabelActive]}>
                      {g.label}
                    </Text>
                    <Text style={[styles.ageSub, isActive && styles.ageSubActive]}>
                      {g.sub}
                    </Text>
                  </View>
                  {isActive && (
                    <Ionicons name="checkmark-circle" size={16} color="#0D9488" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* SECTION 2: SỐ LƯỢNG TRẺ (Stepper Counter) */}
        <View style={styles.sectionCard}>
          <View style={styles.stepperRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.label}>
                Số lượng trẻ cần chăm sóc <Text style={styles.star}>*</Text>
              </Text>
              <Text style={styles.subHintText}>Từ bé thứ 2: thêm phụ phí 25.000đ/giờ</Text>
            </View>

            <View style={styles.stepperControl}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => handleAdjustChildren(-1)}
                disabled={Number(numChildren) <= 1}
              >
                <Text style={[styles.stepperBtnText, Number(numChildren) <= 1 && { color: '#CBD5E1' }]}>
                  −
                </Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{numChildren} bé</Text>
              <TouchableOpacity
                style={[styles.stepperBtn, styles.stepperBtnPlus]}
                onPress={() => handleAdjustChildren(1)}
              >
                <Text style={[styles.stepperBtnText, { color: '#FFFFFF' }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* SECTION 3: CÔNG VIỆC CẦN CHĂM SÓC (Multi-select) */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>
              Nhiệm vụ chăm sóc <Text style={styles.star}>*</Text>
            </Text>
            <View style={styles.dutiesBadge}>
              <Text style={styles.dutiesBadgeText}>Đã chọn {duties.length} việc</Text>
            </View>
          </View>
          <Text style={styles.subHintText}>Chạm để chọn các công việc CarePartner sẽ thực hiện:</Text>

          <View style={styles.dutiesWrap}>
            {DUTIES.map((d) => {
              const isSelected = duties.includes(d.code);
              return (
                <TouchableOpacity
                  key={d.code}
                  style={[styles.dutyChip, isSelected && styles.dutyChipActive]}
                  onPress={() => toggleDuty(d.code)}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13 }}>{d.icon}</Text>
                  <Text style={[styles.dutyChipText, isSelected && styles.dutyChipTextActive]}>
                    {d.label}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={13} color="#0D9488" style={{ marginLeft: 2 }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* SECTION 4: LƯU Ý Y TẾ & DỊ ỨNG */}
        <View style={styles.alertCard}>
          <View style={styles.alertHeader}>
            <View style={styles.alertIcon}>
              <Ionicons name="warning" size={14} color="#FFFFFF" />
            </View>
            <Text style={styles.alertTitle}>Lưu ý y tế / Dị ứng của bé (Rất quan trọng)</Text>
          </View>
          <Text style={styles.alertDesc}>
            Giúp người chăm sóc phòng tránh sự cố và xử lý kịp thời khi có dấu hiệu bất thường.
          </Text>
          <TextInput
            style={styles.alertTextarea}
            placeholder="VD: Bé bị dị ứng đạm sữa bò, không ăn hải sản. Uống siro ho thảo dược 5ml sau bữa trưa lúc 12h30..."
            placeholderTextColor="#B45309"
            value={allergyNotes}
            onChangeText={setAllergyNotes}
            multiline
            numberOfLines={2}
          />
        </View>

        {/* SECTION 5: YÊU CẦU CỤ THỂ VỚI BẢO MẪU */}
        <View style={styles.sectionCard}>
          <Text style={styles.label}>
            Yêu cầu chi tiết đối với người trông trẻ <Text style={styles.star}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="VD: Cần người dịu dàng, kiên nhẫn, không cho bé xem điện thoại nhiều, chủ động báo cáo ảnh qua app..."
            placeholderTextColor="#94A3B8"
            value={requirements}
            onChangeText={setRequirements}
            multiline
            numberOfLines={2}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reqChipsScroll}>
            <Text style={styles.reqGoiY}>Gợi ý:</Text>
            {QUICK_REQUIREMENTS.map((r, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.reqChip}
                onPress={() => handleRequirementTag(r)}
              >
                <Text style={styles.reqChipText}>+ {r}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* SECTION 6: LỊCH TRÔNG & THỜI GIAN */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>
              Lịch làm việc & Thời gian <Text style={styles.star}>*</Text>
            </Text>
            <Text style={[styles.helperHint, { color: '#0D9488', fontWeight: '700' }]}>
              {dates.length > 0 ? `${dates.length} ngày đã chọn` : 'Chưa chọn ngày'}
            </Text>
          </View>

          <View style={styles.datesContainer}>
            {dates.map((d) => (
              <View key={d} style={styles.dateChip}>
                <Ionicons name="calendar-outline" size={13} color="#0D9488" />
                <Text style={styles.dateChipText}>{d}</Text>
                <TouchableOpacity onPress={() => setDates(dates.filter((x) => x !== d))}>
                  <Ionicons name="close" size={14} color="#0D9488" />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={styles.addDateBtn}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={15} color="#0D9488" />
              <Text style={styles.addDateBtnText}>Thêm ngày</Text>
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
                  placeholder="08:00"
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
                  placeholder="17:00"
                />
              </View>
            </View>
          </View>
          <Text style={styles.totalTimeHint}>⏱ Tổng thời lượng: 9 giờ / ngày (ca ngày)</Text>
        </View>

        {/* SECTION 7: MỨC PHÍ ĐỀ XUẤT */}
        <View style={styles.sectionCard}>
          <Text style={styles.label}>
            Mức phí đề xuất / giờ (VNĐ) <Text style={styles.star}>*</Text>
          </Text>

          <View style={styles.rateInputWrap}>
            <TextInput
              style={styles.rateInput}
              placeholder="80000"
              value={rate}
              onChangeText={setRate}
              keyboardType="numeric"
            />
            <Text style={styles.rateSuffix}>VNĐ / giờ</Text>
          </View>

          <View style={styles.benchmarkBox}>
            <View style={styles.benchmarkIcon}>
              <Text style={{ fontSize: 11, color: '#FFFFFF', fontWeight: '800' }}>✓</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.benchmarkTitle}>Mức phí rất hợp lý & thu hút</Text>
              <Text style={styles.benchmarkDesc}>
                Khung thị trường: 60.000đ – 95.000đ/giờ. Dự kiến nhận được 3-5 ứng viên phản hồi trong 15 phút.
              </Text>
            </View>
          </View>
        </View>

        {/* SECTION 8: ĐỊA ĐIỂM TRÔNG BÉ */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>
              Địa điểm trông bé <Text style={styles.star}>*</Text>
            </Text>
            <Text style={styles.helperHint}>Nhà riêng</Text>
          </View>

          <JobLocationPicker value={location} onChange={setLocation} />

          <View style={{ marginTop: 10 }}>
            <Text style={styles.subHintText}>Chi tiết căn hộ / số nhà:</Text>
            <TextInput
              style={styles.input}
              placeholder="VD: Căn 12.04, Tháp A, Chung cư Florita, Q.7..."
              placeholderTextColor="#94A3B8"
              value={locationNote}
              onChangeText={setLocationNote}
            />
          </View>
        </View>

        {/* Trust Footer Micro-Banner */}
        <View style={styles.trustBanner}>
          <Ionicons name="shield-checkmark" size={15} color="#0D9488" />
          <Text style={styles.trustBannerText}>
            Thanh toán an toàn qua VietQR/MoMo · Chỉ trả tiền khi phụ huynh xác nhận xong việc
          </Text>
        </View>
      </ScrollView>

      {/* 3. STICKY BOTTOM ACTION DOCK */}
      <View style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.dockLeft}>
          <Text style={styles.dockSub}>Tạm tính (9h × {estimatedDays} ngày):</Text>
          <Text style={styles.dockPrice}>
            ~{estimatedTotal.toLocaleString('vi-VN')}
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#0D9488' }}>đ</Text>
          </Text>
          <View style={styles.guaranteePill}>
            <View style={styles.guaranteeDot} />
            <Text style={styles.guaranteeText}>Giữ cọc ví an toàn</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.dockCtaBtn, submitting && { opacity: 0.6 }]}
          onPress={submit}
          disabled={submitting}
          activeOpacity={0.88}
        >
          <Text style={styles.ctaTitle}>{submitting ? 'Đang đăng...' : 'Đăng việc & Tìm CarePartner'}</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
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
    backgroundColor: '#0D9488',
  },
  topBarSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0D9488',
  },

  // 2. SCROLL CONTENT
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  heroBanner: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
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
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  heroTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroDesc: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    lineHeight: 16,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  heroPillDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  heroPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
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
    color: '#E11D48',
    fontWeight: '800',
  },
  helperHint: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  subHintText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 6,
  },

  // Age Grid
  ageGrid: {
    gap: 8,
  },
  ageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  ageCardActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#0D9488',
    borderWidth: 1.5,
  },
  ageIcon: {
    fontSize: 20,
  },
  ageLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  ageLabelActive: {
    color: '#065F46',
  },
  ageSub: {
    fontSize: 10.5,
    color: '#64748B',
  },
  ageSubActive: {
    color: '#047857',
    fontWeight: '600',
  },

  // Stepper
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    padding: 3,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  stepperBtnPlus: {
    backgroundColor: '#0D9488',
  },
  stepperBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  stepperValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    paddingHorizontal: 12,
  },

  // Duties
  dutiesBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  dutiesBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  dutiesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  dutyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 5,
  },
  dutyChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#0D9488',
    borderWidth: 1.5,
  },
  dutyChipText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  dutyChipTextActive: {
    color: '#065F46',
    fontWeight: '800',
  },

  // Alert Card (Medical)
  alertCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 18,
    padding: 12,
    ...SHADOWS.small,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  alertIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  alertDesc: {
    fontSize: 10.5,
    color: '#B45309',
    marginBottom: 8,
    lineHeight: 15,
  },
  alertTextarea: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 9,
    fontSize: 12,
    color: '#78350F',
    height: 55,
    textAlignVertical: 'top',
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
    height: 65,
    textAlignVertical: 'top',
    lineHeight: 18,
  },
  reqChipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  reqGoiY: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  reqChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  reqChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
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
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
  },
  dateChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  addDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#0D9488',
    borderStyle: 'dashed',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  addDateBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0D9488',
  },

  timeGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
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
  totalTimeHint: {
    fontSize: 10.5,
    color: '#64748B',
    textAlign: 'right',
    marginTop: 6,
    fontWeight: '600',
  },

  rateInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#0D9488',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  rateInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    paddingVertical: 8,
  },
  rateSuffix: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0D9488',
  },
  benchmarkBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
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
    color: '#065F46',
    textAlign: 'center',
    paddingHorizontal: 8,
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
    backgroundColor: '#0D9488',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...SHADOWS.small,
  },
  ctaTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
