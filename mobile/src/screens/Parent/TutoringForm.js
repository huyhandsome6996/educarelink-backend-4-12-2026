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
import { createJob, publishJob, getMatchingCandidates } from '../../api/matching';
import JobLocationPicker from '../../components/JobLocationPicker';
import { formatDateToYMD, getTodayYMD, extractErrorMessage } from '../../utils/date';
import SearchingCarePartnerModal from '../../components/SearchingCarePartnerModal';

// DateTimePicker chỉ trên native
let DateTimePicker;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

export const CURRICULUM_TIERS = {
  cap_1: {
    label: 'Cấp 1 (Tiểu học)',
    ageRange: [6, 10],
    defaultAge: 8,
    subjects: [
      { code: 'toan', name: 'Toán' },
      { code: 'tieng_viet', name: 'Tiếng Việt' },
      { code: 'tu_nhien_xa_hoi', name: 'Tự nhiên và Xã hội' },
      { code: 'am_nhac', name: 'Âm nhạc' },
      { code: 'my_thuat', name: 'Mỹ thuật' },
      { code: 'tin_hoc_cong_nghe', name: 'Tin học và Công nghệ' },
      { code: 'lich_su', name: 'Lịch sử' },
      { code: 'dia_ly', name: 'Địa lý' },
      { code: 'tieng_anh', name: 'Tiếng Anh' },
      { code: 'tieng_trung', name: 'Tiếng Trung' },
    ],
  },
  cap_2: {
    label: 'Cấp 2 (THCS)',
    ageRange: [11, 15],
    defaultAge: 13,
    subjects: [
      { code: 'toan', name: 'Toán' },
      { code: 'van', name: 'Ngữ văn' },
      { code: 'tieng_anh', name: 'Tiếng Anh' },
      { code: 'tieng_trung', name: 'Tiếng Trung' },
      { code: 'giao_duc_cong_dan', name: 'Giáo dục công dân' },
      { code: 'khoa_hoc_tu_nhien', name: 'Khoa học tự nhiên' },
      { code: 'lich_su_dia_ly', name: 'Lịch sử và Địa lý' },
      { code: 'tin_hoc', name: 'Tin học' },
      { code: 'cong_nghe', name: 'Công nghệ' },
      { code: 'am_nhac', name: 'Âm nhạc' },
      { code: 'my_thuat', name: 'Mỹ thuật' },
      { code: 'hoa', name: 'Hoá học' },
      { code: 'ly', name: 'Vật lý' },
      { code: 'sinh', name: 'Sinh học' },
    ],
  },
  cap_3: {
    label: 'Cấp 3 (THPT)',
    ageRange: [16, 18],
    defaultAge: 16,
    subjects: [
      { code: 'toan', name: 'Toán' },
      { code: 'van', name: 'Ngữ văn' },
      { code: 'tieng_anh', name: 'Tiếng Anh' },
      { code: 'tieng_trung', name: 'Tiếng Trung' },
      { code: 'lich_su', name: 'Lịch sử' },
      { code: 'ly', name: 'Vật lý' },
      { code: 'hoa', name: 'Hoá học' },
      { code: 'sinh', name: 'Sinh học' },
      { code: 'dia_ly', name: 'Địa lý' },
      { code: 'giao_duc_kinh_te_phap_luat', name: 'Giáo dục kinh tế và Pháp luật' },
      { code: 'tin_hoc', name: 'Tin học' },
      { code: 'cong_nghe', name: 'Công nghệ' },
      { code: 'am_nhac', name: 'Âm nhạc' },
      { code: 'my_thuat', name: 'Mỹ thuật' },
    ],
  },
};

export const SENIORITY_OPTIONS = [
  { key: 'student_year_1_2', label: 'Sinh viên năm 1-2' },
  { key: 'student_year_3_4', label: 'Sinh viên năm 3-4 (Ưu tiên Sư phạm)' },
  { key: 'graduate', label: 'Cử nhân / Đã tốt nghiệp' },
  { key: 'any', label: 'Không yêu cầu' },
];

export function getSchoolLevel(age) {
  if (age <= 10) return 'cap_1';
  if (age <= 15) return 'cap_2';
  return 'cap_3';
}

export function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export function calculateTutoringPricing(timeFrom, timeTo, rate, numDates = 0) {
  const minutesFrom = parseTimeToMinutes(timeFrom);
  const minutesTo = parseTimeToMinutes(timeTo);
  const durationMinutes =
    minutesFrom !== null && minutesTo !== null ? minutesTo - minutesFrom : 0;
  const isValidTime = durationMinutes >= 30;
  const sessionDurationHours = isValidTime ? durationMinutes / 60 : 0;
  const hourlyRate = Number(rate) || 0;
  const costPerSession = isValidTime ? Math.round(sessionDurationHours * hourlyRate) : 0;
  const totalEstimatedCost = isValidTime ? costPerSession * numDates : 0;
  return {
    durationMinutes,
    isValidTime,
    sessionDurationHours,
    hourlyRate,
    costPerSession,
    totalEstimatedCost,
  };
}

const QUICK_TAGS = [
  'Kiên nhẫn',
  'Gia sư nữ',
  'ĐH Sư Phạm',
  'Ôn thi học kỳ',
  'Có xe máy',
];

export default function TutoringForm() {
  const navigation = useNavigation();
  const [childAge, setChildAge] = useState(8);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [seniorityPreference, setSeniorityPreference] = useState('any');
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
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchStatus, setSearchStatus] = useState('searching');
  const [searchError, setSearchError] = useState('');

  const schoolLevel = getSchoolLevel(childAge);

  const updateAge = (newAge) => {
    const clampedAge = Math.max(6, Math.min(18, newAge));
    const oldLevel = getSchoolLevel(childAge);
    const newLevel = getSchoolLevel(clampedAge);
    setChildAge(clampedAge);
    if (oldLevel !== newLevel) {
      const allowedCodes = CURRICULUM_TIERS[newLevel].subjects.map((s) => s.code);
      setSelectedSubjects((prev) => prev.filter((s) => allowedCodes.includes(s.code)));
    }
  };

  const toggleSubject = (subj) => {
    const isSelected = selectedSubjects.some((s) => s.code === subj.code);
    if (isSelected) {
      setSelectedSubjects((prev) => prev.filter((s) => s.code !== subj.code));
    } else {
      if (selectedSubjects.length >= 3) {
        Alert.alert('Giới hạn môn học', 'Chỉ được chọn tối đa 3 môn học cùng lúc.');
        return;
      }
      setSelectedSubjects((prev) => [...prev, subj]);
    }
  };

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

  // Tính toán biểu giá phản ứng (dynamic reactive pricing) & kiểm tra hợp lệ
  const pricing = calculateTutoringPricing(timeFrom, timeTo, rate, dates.length);
  const { isValidTime, sessionDurationHours, costPerSession, totalEstimatedCost } = pricing;
  const displayCost = dates.length > 0 ? totalEstimatedCost : costPerSession;

  const submit = async () => {
    const subjectStr =
      selectedSubjects.length > 0
        ? selectedSubjects.map((s) => s.name).join(', ')
        : subject.trim();
    const subjectCodes = selectedSubjects.map((s) => s.code);

    if (!subjectStr)
      return Alert.alert('Thiếu thông tin', 'Vui lòng chọn ít nhất 1 môn học.');
    if (dates.length === 0)
      return Alert.alert('Thiếu thông tin', 'Vui lòng chọn ít nhất 1 ngày học.');
    if (!isValidTime)
      return Alert.alert('Thời gian không hợp lệ', 'Giờ kết thúc phải sau giờ bắt đầu ít nhất 30 phút.');
    if (!location)
      return Alert.alert('Thiếu thông tin', 'Vui lòng chọn vị trí trên bản đồ.');
    if (!rate || Number(rate) <= 0)
      return Alert.alert('Thiếu thông tin', 'Vui lòng nhập học phí/giờ (VNĐ > 0).');

    // Tự động điền yêu cầu mặc định nếu phụ huynh chưa kịp nhập
    const finalRequirements =
      requirements.trim() ||
      `Dạy kèm môn ${subjectStr}, hướng dẫn bài tập và hỗ trợ bé rèn luyện kiến thức vững vàng.`;

    setSubmitting(true);
    setSearchModalVisible(true);
    setSearchStatus('searching');
    setSearchError('');
    let createdJobId = null;
    const searchStartTime = Date.now();
    try {
      const { data: job } = await createJob({
        job_type: 'tutoring',
        subject: subjectStr,
        subject_code: subjectCodes,
        child_age: childAge,
        school_level: schoolLevel,
        tutor_seniority_preference: seniorityPreference,
        specific_requirements: finalRequirements,
        dates,
        time_from: timeFrom,
        time_to: timeTo,
        latitude: location.latitude,
        longitude: location.longitude,
        location_note: locationNote || location?.label || 'Vị trí đã chọn trên bản đồ',
        hourly_rate_vnd: Number(rate),
      });
      createdJobId = job?.id;

      // Đăng + chạy AI parse ngay (Step 1.2 → ai_parsed + tạo slots)
      const { data: pubRes } = await publishJob(job.id);

      // Tải trước danh sách ứng viên ngay trong lúc modal tìm kiếm đang quét sóng radar
      let matchedCandidates = null;
      let totalMatched = null;
      let freshJob = null;
      try {
        const { data: candRes } = await getMatchingCandidates(job.id);
        matchedCandidates = candRes?.candidates || null;
        totalMatched = candRes?.total_matched || null;
        freshJob = candRes?.job || null;
      } catch (candErr) {
        // Dự phòng demo nếu kết nối chậm
      }

      const scheduleStr = `${timeFrom} - ${timeTo} (${dates.length} buổi)`;
      const richJob = {
        ...job,
        ...(freshJob || {}),
        title: pubRes?.title || freshJob?.title || job.title || `Gia sư ${subjectStr}`,
        category_label: freshJob?.category_label || pubRes?.category_label || 'Gia sư & Kèm học 1:1',
        category_icon: freshJob?.category_icon || pubRes?.category_icon || 'school',
        hourly_rate_vnd: Number(rate),
        schedule: freshJob?.schedule || pubRes?.schedule || scheduleStr,
        // Defect 2: bỏ hard-code 'Cầu Giấy, Hà Nội' — dùng label reverse-geocoding
        // nếu phụ huynh không nhập ghi chú, fallback trung tính nếu chưa có gì
        location_note: locationNote || location?.label || 'Vị trí đã chọn trên bản đồ',
      };

      // Giữ modal chạy tối thiểu 1.2s để tạo cảm giác quét radar chân thực
      const elapsed = Date.now() - searchStartTime;
      const minDisplayTime = 1200;
      if (elapsed < minDisplayTime) {
        await new Promise((resolve) => setTimeout(resolve, minDisplayTime - elapsed));
      }

      // Đã tìm thấy ứng viên -> chuyển sang trạng thái thành công
      setSearchStatus('success');

      // Tự động nhảy thẳng qua trang hiển thị ứng viên và render ngay lập tức!
      setTimeout(() => {
        setSearchModalVisible(false);
        navigation.navigate('CandidatesList', {
          jobId: job.id,
          job: richJob,
          candidates: matchedCandidates,
          totalMatched,
        });
      }, 600);
    } catch (err) {
      if (createdJobId) {
        // Đã lưu bài đăng thành công -> tự động chuyển sang xem ứng viên
        setSearchStatus('success');
        const fallbackSchedule = `${timeFrom} - ${timeTo} (${dates.length} buổi)`;
        const fallbackRichJob = {
          id: createdJobId,
          title: `Gia sư ${subjectStr}`,
          category_label: 'Gia sư & Kèm học 1:1',
          category_icon: 'school',
          hourly_rate_vnd: Number(rate),
          schedule: fallbackSchedule,
          location_note: locationNote || location?.label || 'Vị trí đã chọn trên bản đồ',
        };
        setTimeout(() => {
          setSearchModalVisible(false);
          navigation.navigate('CandidatesList', { jobId: createdJobId, job: fallbackRichJob });
        }, 600);
      } else {
        const msg = extractErrorMessage(err, 'Không đăng được bài. Vui lòng kiểm tra lại thông tin.');
        setSearchStatus('error');
        setSearchError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

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

        {/* SECTION 1: ĐỘ TUỔI, CẤP HỌC & MÔN HỌC */}
        <View style={styles.sectionCard}>
          {/* Age Stepper Header */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>
              Độ tuổi của bé & Cấp học <Text style={styles.star}>*</Text>
            </Text>
            <View style={styles.tierBadge}>
              <Text style={styles.tierBadgeText}>{CURRICULUM_TIERS[schoolLevel].label}</Text>
            </View>
          </View>

          {/* Age Stepper Box */}
          <View style={styles.ageDisplayBox}>
            <View>
              <Text style={styles.ageLabelSub}>Tuổi của học sinh</Text>
              <Text style={styles.ageValueText} testID="child-age-text">
                {childAge} tuổi
              </Text>
            </View>

            <View style={styles.ageControlsRow}>
              <TouchableOpacity
                testID="age-decrement-btn"
                style={[styles.ageStepperBtn, childAge <= 6 && styles.ageStepperBtnDisabled]}
                onPress={() => updateAge(childAge - 1)}
                disabled={childAge <= 6}
                activeOpacity={0.7}
              >
                <Text style={styles.ageStepperBtnText}>－</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="age-increment-btn"
                style={[styles.ageStepperBtn, childAge >= 18 && styles.ageStepperBtnDisabled]}
                onPress={() => updateAge(childAge + 1)}
                disabled={childAge >= 18}
                activeOpacity={0.7}
              >
                <Text style={styles.ageStepperBtnText}>＋</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Tier Pills */}
          <Text style={styles.subHint}>Chọn nhanh cấp học chuẩn:</Text>
          <View style={styles.quickTierRow}>
            <TouchableOpacity
              testID="tier-pill-8"
              style={[styles.quickTierPill, childAge === 8 && styles.quickTierPillActive]}
              onPress={() => updateAge(8)}
              activeOpacity={0.7}
            >
              <Text style={[styles.quickTierPillText, childAge === 8 && styles.quickTierPillTextActive]}>
                8 tuổi (Cấp 1)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="tier-pill-13"
              style={[styles.quickTierPill, childAge === 13 && styles.quickTierPillActive]}
              onPress={() => updateAge(13)}
              activeOpacity={0.7}
            >
              <Text style={[styles.quickTierPillText, childAge === 13 && styles.quickTierPillTextActive]}>
                13 tuổi (Cấp 2)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="tier-pill-16"
              style={[styles.quickTierPill, childAge === 16 && styles.quickTierPillActive]}
              onPress={() => updateAge(16)}
              activeOpacity={0.7}
            >
              <Text style={[styles.quickTierPillText, childAge === 16 && styles.quickTierPillTextActive]}>
                16 tuổi (Cấp 3)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Multi-Select Subject Grid */}
          <View style={[styles.sectionHeaderRow, { marginTop: 14 }]}>
            <Text style={styles.label}>
              Môn học cần kèm (Tối đa 3 môn) <Text style={styles.star}>*</Text>
            </Text>
            <Text style={[styles.helperHint, selectedSubjects.length > 0 && { color: '#F26522', fontWeight: '700' }]}>
              {selectedSubjects.length}/3 môn đã chọn
            </Text>
          </View>

          <View style={styles.subjectGrid}>
            {CURRICULUM_TIERS[schoolLevel].subjects.map((subj) => {
              const isSelected = selectedSubjects.some((s) => s.code === subj.code);
              return (
                <TouchableOpacity
                  key={subj.code}
                  testID={`subject-grid-item-${subj.code}`}
                  style={[styles.subjectGridCard, isSelected && styles.subjectGridCardActive]}
                  onPress={() => toggleSubject(subj)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.subjectGridCardText, isSelected && styles.subjectGridCardTextActive]}
                    numberOfLines={1}
                  >
                    {subj.name}
                  </Text>
                  {isSelected ? (
                    <View style={styles.subjectCheckCircle}>
                      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                    </View>
                  ) : (
                    <View style={styles.subjectUncheckedCircle} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Seniority Preference */}
          <View style={[styles.sectionHeaderRow, { marginTop: 14 }]}>
            <Text style={styles.label}>Ưu tiên gia sư</Text>
            <Text style={styles.helperHint}>Tùy chọn</Text>
          </View>
          <View style={styles.seniorityRow}>
            {SENIORITY_OPTIONS.map((opt) => {
              const isSelected = seniorityPreference === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  testID={`seniority-chip-${opt.key}`}
                  style={[styles.seniorityChip, isSelected && styles.seniorityChipActive]}
                  onPress={() => setSeniorityPreference(opt.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.seniorityChipText, isSelected && styles.seniorityChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
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

          {/* Time Validation Warning */}
          {!isValidTime && (
            <View style={styles.timeWarningBox} testID="time-warning-box">
              <Ionicons name="alert-circle" size={15} color="#EF4444" style={{ marginRight: 6 }} />
              <Text style={styles.timeWarningText} testID="time-warning-text">
                Giờ kết thúc phải sau giờ bắt đầu ít nhất 30 phút.
              </Text>
            </View>
          )}

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
          {isValidTime ? (
            <>
              <Text style={styles.dockSub}>
                {dates.length > 0
                  ? `Tạm tính (${dates.length} buổi · ${sessionDurationHours}h/ca):`
                  : `Tạm tính 1 ca (${sessionDurationHours}h):`}
              </Text>
              <Text style={styles.dockPrice} testID="dock-price-text">
                ~{displayCost.toLocaleString('vi-VN')}
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>đ</Text>
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.dockSub}>Tạm tính:</Text>
              <Text style={[styles.dockPrice, { color: '#EF4444' }]} testID="dock-price-text">
                -- đ
              </Text>
            </>
          )}
          <View style={styles.guaranteePill}>
            <View style={styles.guaranteeDot} />
            <Text style={styles.guaranteeText}>Bảo vệ hoàn tiền 100%</Text>
          </View>
        </View>

        <TouchableOpacity
          testID="submit-job-btn"
          style={[styles.dockCtaBtn, (submitting || !isValidTime) && { opacity: 0.4 }]}
          onPress={submit}
          disabled={submitting || !isValidTime}
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

      {/* Bottom Sheet Animation: Đang tìm kiếm CarePartner */}
      <SearchingCarePartnerModal
        visible={searchModalVisible}
        status={searchStatus}
        serviceType="Gia sư & Kèm học 1:1"
        serviceIcon="school"
        errorMessage={searchError}
        onClose={() => setSearchModalVisible(false)}
      />
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

  // Time Validation Warning
  timeWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  timeWarningText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#EF4444',
  },

  // Age Stepper & Tiers
  ageDisplayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ageLabelSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  ageValueText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  tierBadge: {
    backgroundColor: '#FFF4ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tierBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EA580C',
  },
  ageControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ageStepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.small,
  },
  ageStepperBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.4,
  },
  ageStepperBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  quickTierRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  quickTierPill: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTierPillActive: {
    backgroundColor: '#FFF4ED',
    borderColor: '#FED7AA',
  },
  quickTierPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  quickTierPillTextActive: {
    color: '#F26522',
    fontWeight: '800',
  },

  // Multi-Select Subject Grid
  subjectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  subjectGridCard: {
    width: '48.5%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subjectGridCardActive: {
    backgroundColor: '#FFF4ED',
    borderColor: '#F26522',
  },
  subjectGridCardText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  subjectGridCardTextActive: {
    color: '#F26522',
    fontWeight: '800',
  },
  subjectCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F26522',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  subjectUncheckedCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginLeft: 4,
  },

  // Seniority Preferences
  seniorityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  seniorityChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  seniorityChipActive: {
    backgroundColor: '#FFF4ED',
    borderColor: '#FED7AA',
  },
  seniorityChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  seniorityChipTextActive: {
    color: '#EA580C',
    fontWeight: '800',
  },
});
